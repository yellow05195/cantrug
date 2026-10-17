CREATE TABLE "candles" (
	"mint" text NOT NULL,
	"interval" text NOT NULL,
	"bucket_ts" timestamp with time zone NOT NULL,
	"open" numeric NOT NULL,
	"high" numeric NOT NULL,
	"low" numeric NOT NULL,
	"close" numeric NOT NULL,
	"volume_sol" numeric(39, 0) NOT NULL,
	"trades" integer NOT NULL,
	"floor_at_close" numeric NOT NULL,
	"open_slot" bigint NOT NULL,
	"close_slot" bigint NOT NULL,
	CONSTRAINT "candles_mint_interval_bucket_ts_pk" PRIMARY KEY("mint","interval","bucket_ts")
);
--> statement-breakpoint
CREATE TABLE "coins" (
	"mint" text PRIMARY KEY NOT NULL,
	"coin" text DEFAULT '' NOT NULL,
	"creator" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"symbol" text DEFAULT '' NOT NULL,
	"uri" text DEFAULT '' NOT NULL,
	"image_url" text,
	"description" text,
	"params" jsonb,
	"phase" text DEFAULT 'curve' NOT NULL,
	"created_slot" bigint,
	"created_ts" timestamp with time zone,
	"graduated_slot" bigint,
	"graduated_ts" timestamp with time zone,
	"real_sol" numeric(39, 0) DEFAULT 0 NOT NULL,
	"tokens_sold" numeric(39, 0) DEFAULT 0 NOT NULL,
	"floor_reserve" numeric(39, 0) DEFAULT 0 NOT NULL,
	"pool_sol" numeric(39, 0) DEFAULT 0 NOT NULL,
	"pool_tok" numeric(39, 0) DEFAULT 0 NOT NULL,
	"queued" numeric(39, 0) DEFAULT 0 NOT NULL,
	"supply" numeric(39, 0) DEFAULT 0 NOT NULL,
	"sol_reserves" numeric(39, 0) DEFAULT 0 NOT NULL,
	"token_reserves" numeric(39, 0) DEFAULT 0 NOT NULL,
	"circulating" numeric(39, 0) DEFAULT 0 NOT NULL,
	"floor_lamports_per_token" numeric DEFAULT '0' NOT NULL,
	"price_lamports_per_token" numeric DEFAULT '0' NOT NULL,
	"mcap_sol" numeric(39, 0) DEFAULT 0 NOT NULL,
	"holders_count" integer DEFAULT 0 NOT NULL,
	"total_redeemed_sol" numeric(39, 0) DEFAULT 0 NOT NULL,
	"redeem_count" integer DEFAULT 0 NOT NULL,
	"buy_count" integer DEFAULT 0 NOT NULL,
	"sell_count" integer DEFAULT 0 NOT NULL,
	"volume_sol" numeric(39, 0) DEFAULT 0 NOT NULL,
	"brake_engaged" boolean DEFAULT false NOT NULL,
	"brake_window_start" bigint,
	"brake_epoch" integer DEFAULT 0 NOT NULL,
	"brake_engagements" integer DEFAULT 0 NOT NULL,
	"brake_ref_sol" numeric(39, 0) DEFAULT 0 NOT NULL,
	"brake_ref_tok" numeric(39, 0) DEFAULT 0 NOT NULL,
	"last_trade_ts" timestamp with time zone,
	"last_event_slot" bigint DEFAULT 0 NOT NULL,
	"last_event_ts" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floor_snapshots" (
	"mint" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"floor" numeric NOT NULL,
	"price" numeric NOT NULL,
	"pool_sol" numeric(39, 0) NOT NULL,
	"pool_tok" numeric(39, 0) NOT NULL,
	"circulating" numeric(39, 0) NOT NULL,
	"floor_active" boolean NOT NULL,
	CONSTRAINT "floor_snapshots_mint_minute_pk" PRIMARY KEY("mint","minute")
);
--> statement-breakpoint
CREATE TABLE "global_stats" (
	"id" integer PRIMARY KEY NOT NULL,
	"sol_redeemed_total" numeric(39, 0) DEFAULT 0 NOT NULL,
	"coins_created" integer DEFAULT 0 NOT NULL,
	"coins_graduated" integer DEFAULT 0 NOT NULL,
	"brake_engagements_total" integer DEFAULT 0 NOT NULL,
	"rugs_avoided" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holders" (
	"mint" text NOT NULL,
	"owner" text NOT NULL,
	"balance" numeric(39, 0) NOT NULL,
	"last_updated" timestamp with time zone NOT NULL,
	CONSTRAINT "holders_mint_owner_pk" PRIMARY KEY("mint","owner")
);
--> statement-breakpoint
CREATE TABLE "processed_signatures" (
	"signature" text PRIMARY KEY NOT NULL,
	"slot" bigint NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queue_events" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"mint" text NOT NULL,
	"kind" text NOT NULL,
	"user" text,
	"epoch" integer,
	"amount" numeric(39, 0),
	"queued_total" numeric(39, 0),
	"sol_amount" numeric(39, 0),
	"settle_kind" smallint,
	"window_start" bigint,
	"data" jsonb NOT NULL,
	"slot" bigint NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	CONSTRAINT "queue_events_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
CREATE TABLE "redeems" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"mint" text NOT NULL,
	"user" text NOT NULL,
	"tokens_burned" numeric(39, 0) NOT NULL,
	"pool_tokens_burned" numeric(39, 0) NOT NULL,
	"sol_out" numeric(39, 0) NOT NULL,
	"fee_kept" numeric(39, 0) NOT NULL,
	"from_queue" boolean NOT NULL,
	"slot" bigint NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	CONSTRAINT "redeems_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"signature" text NOT NULL,
	"event_index" integer NOT NULL,
	"ix_index" integer NOT NULL,
	"mint" text NOT NULL,
	"user" text NOT NULL,
	"side" text NOT NULL,
	"phase" text NOT NULL,
	"is_queue_fill" boolean NOT NULL,
	"sol_amount" numeric(39, 0) NOT NULL,
	"token_amount" numeric(39, 0) NOT NULL,
	"fee_total" numeric(39, 0) NOT NULL,
	"fee_to_floor" numeric(39, 0) NOT NULL,
	"price_after" numeric NOT NULL,
	"floor_after" numeric NOT NULL,
	"queued_remainder" numeric(39, 0) NOT NULL,
	"slot" bigint NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	CONSTRAINT "trades_signature_event_index_pk" PRIMARY KEY("signature","event_index")
);
--> statement-breakpoint
CREATE INDEX "coins_created_slot_idx" ON "coins" USING btree ("created_slot");--> statement-breakpoint
CREATE INDEX "coins_phase_real_sol_idx" ON "coins" USING btree ("phase","real_sol");--> statement-breakpoint
CREATE INDEX "coins_volume_idx" ON "coins" USING btree ("volume_sol");--> statement-breakpoint
CREATE INDEX "coins_floor_idx" ON "coins" USING btree ("floor_lamports_per_token");--> statement-breakpoint
CREATE INDEX "coins_creator_idx" ON "coins" USING btree ("creator");--> statement-breakpoint
CREATE INDEX "holders_owner_idx" ON "holders" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "queue_events_mint_slot_idx" ON "queue_events" USING btree ("mint","slot");--> statement-breakpoint
CREATE INDEX "queue_events_kind_idx" ON "queue_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "redeems_mint_slot_idx" ON "redeems" USING btree ("mint","slot");--> statement-breakpoint
CREATE INDEX "redeems_user_idx" ON "redeems" USING btree ("user");--> statement-breakpoint
CREATE INDEX "redeems_ts_idx" ON "redeems" USING btree ("ts");--> statement-breakpoint
CREATE INDEX "trades_mint_slot_idx" ON "trades" USING btree ("mint","slot");--> statement-breakpoint
CREATE INDEX "trades_user_idx" ON "trades" USING btree ("user");