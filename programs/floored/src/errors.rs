use anchor_lang::prelude::*;
use floored_core::CoreError;

#[error_code]
pub enum FloorError {
    #[msg("arithmetic overflow")]
    Overflow,
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("output rounds to nothing")]
    DustOutput,
    #[msg("the curve is complete: call graduate")]
    CurveComplete,
    #[msg("the curve is not complete yet")]
    CurveNotComplete,
    #[msg("amount exceeds what is available")]
    ExceedsAvailable,
    #[msg("nothing in circulation")]
    NothingInCirculation,
    #[msg("invalid parameters")]
    InvalidParams,
    #[msg("queue fill exceeds the queue")]
    ExceedsQueue,
    #[msg("instruction not available in this phase")]
    WrongPhase,
    #[msg("slippage limit exceeded")]
    SlippageExceeded,
    #[msg("name longer than 32 bytes")]
    NameTooLong,
    #[msg("symbol longer than 10 bytes")]
    SymbolTooLong,
    #[msg("uri longer than 200 bytes")]
    UriTooLong,
    #[msg("nothing to claim")]
    NothingToClaim,
    #[msg("queue entry belongs to a closed epoch: settle it with claim_queue / cancel_queue first")]
    StaleQueueEntry,
    #[msg("queue entry does not match this coin / owner")]
    QueueEntryMismatch,
    #[msg("epoch record does not match the expected epoch")]
    EpochRecordMismatch,
    #[msg("epoch is not closed yet")]
    EpochNotClosed,
    #[msg("the brake window has not elapsed")]
    WindowNotElapsed,
    #[msg("the queue is empty")]
    QueueEmpty,
    #[msg("vault balance does not cover the tracked amount")]
    VaultAccounting,
    #[msg("unauthorized")]
    Unauthorized,
    #[msg("invalid vault account")]
    InvalidVault,
    #[msg("no queue position for this wallet")]
    NotQueued,
    #[msg("account already initialized")]
    AlreadyInitialized,
}

pub fn map_core(e: CoreError) -> Error {
    match e {
        CoreError::Overflow | CoreError::DivisionByZero => FloorError::Overflow.into(),
        CoreError::ZeroAmount => FloorError::ZeroAmount.into(),
        CoreError::DustOutput => FloorError::DustOutput.into(),
        CoreError::CurveComplete => FloorError::CurveComplete.into(),
        CoreError::CurveNotComplete => FloorError::CurveNotComplete.into(),
        CoreError::ExceedsAvailable => FloorError::ExceedsAvailable.into(),
        CoreError::NothingInCirculation => FloorError::NothingInCirculation.into(),
        CoreError::InvalidParams => FloorError::InvalidParams.into(),
        CoreError::ExceedsQueue => FloorError::ExceedsQueue.into(),
    }
}

pub trait CoreExt<T> {
    fn or_err(self) -> Result<T>;
}

impl<T> CoreExt<T> for floored_core::CoreResult<T> {
    fn or_err(self) -> Result<T> {
        self.map_err(map_core)
    }
}
