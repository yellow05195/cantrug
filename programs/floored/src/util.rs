//! Lamport and token plumbing shared by the handlers.

use crate::errors::FloorError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::system_program::{self, Allocate, Assign, CreateAccount, Transfer};
use anchor_spl::token::{self, Burn, Token, TokenAccount};

/// Move lamports out of an account owned by this program. The runtime lets a
/// program debit only accounts it owns, which is exactly the property that
/// makes the vaults safe: no other program, and no key, can do this.
pub fn move_lamports<'info>(from: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    require_keys_eq!(*from.owner, crate::ID, FloorError::InvalidVault);
    let mut f = from.try_borrow_mut_lamports()?;
    let mut t = to.try_borrow_mut_lamports()?;
    **f = f.checked_sub(amount).ok_or(FloorError::VaultAccounting)?;
    **t = t.checked_add(amount).ok_or(FloorError::Overflow)?;
    Ok(())
}

/// System transfer signed by the user (lamports into a vault).
pub fn transfer_in<'info>(
    system_program: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    system_program::transfer(
        CpiContext::new(*system_program.key, Transfer { from: from.clone(), to: to.clone() }),
        amount,
    )
}

/// Create a program-owned PDA account of `space` bytes (0 for a lamport
/// vault). Tolerates an address that was pre-funded by a third party (the
/// `transfer + allocate + assign` path), like Anchor's `init`.
pub fn create_pda_account<'info>(
    payer: &AccountInfo<'info>,
    new: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    space: usize,
    seeds: &[&[u8]],
) -> Result<()> {
    require!(new.data_is_empty() && *new.owner == system_program::ID, FloorError::AlreadyInitialized);
    let rent = Rent::get()?.minimum_balance(space);
    let signer: &[&[&[u8]]] = &[seeds];
    if new.lamports() == 0 {
        system_program::create_account(
            CpiContext::new_with_signer(
                *system_program.key,
                CreateAccount { from: payer.clone(), to: new.clone() },
                signer,
            ),
            rent,
            space as u64,
            &crate::ID,
        )
    } else {
        let missing = rent.saturating_sub(new.lamports());
        if missing > 0 {
            system_program::transfer(
                CpiContext::new(*system_program.key, Transfer { from: payer.clone(), to: new.clone() }),
                missing,
            )?;
        }
        system_program::allocate(
            CpiContext::new_with_signer(*system_program.key, Allocate { account_to_allocate: new.clone() }, signer),
            space as u64,
        )?;
        system_program::assign(
            CpiContext::new_with_signer(*system_program.key, Assign { account_to_assign: new.clone() }, signer),
            &crate::ID,
        )
    }
}

/// Close a program-owned data account: lamports to `dest`, data zeroed, owner back to the system program.
pub fn close_pda_account<'info>(acct: &AccountInfo<'info>, dest: &AccountInfo<'info>) -> Result<()> {
    let lamports = acct.lamports();
    move_lamports(acct, dest, lamports)?;
    acct.assign(&system_program::ID);
    acct.resize(0)?;
    Ok(())
}

/// Write an Anchor account (with discriminator) into a raw account's data.
pub fn write_account<T: AccountSerialize>(acct: &AccountInfo, value: &T) -> Result<()> {
    let mut data = acct.try_borrow_mut_data()?;
    let mut cursor: &mut [u8] = &mut data;
    value.try_serialize(&mut cursor)
}

/// Read an Anchor account from a raw account, checking owner and discriminator.
pub fn read_account<T: AccountDeserialize>(acct: &AccountInfo) -> Result<T> {
    require_keys_eq!(*acct.owner, crate::ID, ErrorCode::AccountOwnedByWrongProgram);
    let data = acct.try_borrow_data()?;
    let mut slice: &[u8] = &data;
    T::try_deserialize(&mut slice)
}

/// SPL transfer signed by the coin PDA (out of a program vault / escrow).
pub fn token_transfer_from_coin<'info>(
    token_program: &Program<'info, Token>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    coin: &AccountInfo<'info>,
    mint: &Pubkey,
    bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let seeds: &[&[u8]] = &[SEED_COIN, mint.as_ref(), &[bump]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.key(),
            token::Transfer { from: from.clone(), to: to.clone(), authority: coin.clone() },
            &[seeds],
        ),
        amount,
    )
}

/// SPL transfer signed by the user (into a vault / escrow).
pub fn token_transfer_from_user<'info>(
    token_program: &Program<'info, Token>,
    from: &AccountInfo<'info>,
    to: &AccountInfo<'info>,
    user: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new(
            token_program.key(),
            token::Transfer { from: from.clone(), to: to.clone(), authority: user.clone() },
        ),
        amount,
    )
}

/// Burn from a vault the coin PDA controls (pool vault on redeem, escrow on queue_to_redeem).
pub fn burn_from_coin<'info>(
    token_program: &Program<'info, Token>,
    mint_info: &AccountInfo<'info>,
    from: &AccountInfo<'info>,
    coin: &AccountInfo<'info>,
    mint: &Pubkey,
    bump: u8,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let seeds: &[&[u8]] = &[SEED_COIN, mint.as_ref(), &[bump]];
    token::burn(
        CpiContext::new_with_signer(
            token_program.key(),
            Burn { mint: mint_info.clone(), from: from.clone(), authority: coin.clone() },
            &[seeds],
        ),
        amount,
    )
}

/// A vault must always hold at least its rent plus what the state says it holds.
pub fn check_vault(vault: &AccountInfo, tracked: u64, rent: u64) -> Result<()> {
    require!(vault.lamports() >= tracked.checked_add(rent).ok_or(FloorError::Overflow)?, FloorError::VaultAccounting);
    Ok(())
}

pub fn check_token_vault(vault: &Account<TokenAccount>, tracked: u64) -> Result<()> {
    require!(vault.amount >= tracked, FloorError::VaultAccounting);
    Ok(())
}

/// Invoke an arbitrary instruction with the coin PDA as signer.
pub fn invoke_as_coin<'info>(
    ix: &anchor_lang::solana_program::instruction::Instruction,
    infos: &[AccountInfo<'info>],
    mint: &Pubkey,
    bump: u8,
) -> Result<()> {
    let seeds: &[&[u8]] = &[SEED_COIN, mint.as_ref(), &[bump]];
    invoke_signed(ix, infos, &[seeds]).map_err(Into::into)
}
