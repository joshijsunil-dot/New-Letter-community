CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id text NOT NULL,
  article_id text,
  display_name varchar(40) NOT NULL DEFAULT 'Anonymous',
  body varchar(1200) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'hidden')),
  visitor_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_public_idx
  ON comments (newsletter_id, created_at DESC)
  WHERE status = 'published';

CREATE TABLE IF NOT EXISTS newsletter_reactions (
  newsletter_id text NOT NULL,
  visitor_hash char(64) NOT NULL,
  reaction varchar(20) NOT NULL CHECK (reaction IN ('loved', 'useful', 'insightful', 'resonated', 'taking_action')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (newsletter_id, visitor_hash)
);

CREATE TABLE IF NOT EXISTS votes (
  target_type varchar(20) NOT NULL CHECK (target_type IN ('newsletter', 'comment')),
  target_id text NOT NULL,
  visitor_hash char(64) NOT NULL,
  value smallint NOT NULL CHECK (value IN (-1, 1)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id, visitor_hash)
);

CREATE INDEX IF NOT EXISTS votes_target_idx ON votes (target_type, target_id);

CREATE TABLE IF NOT EXISTS action_events (
  id bigserial PRIMARY KEY,
  fingerprint char(64) NOT NULL,
  action varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_events_lookup_idx
  ON action_events (fingerprint, action, created_at DESC);

-- The application database role only needs these privileges.
-- Replace newsletter_app with your actual Neon role if desired.
-- GRANT SELECT, INSERT, UPDATE ON comments, newsletter_reactions, votes, action_events TO newsletter_app;
-- GRANT USAGE, SELECT ON SEQUENCE action_events_id_seq TO newsletter_app;


-- Run this migration on databases created before the Taking Action reaction was added.
ALTER TABLE newsletter_reactions
  DROP CONSTRAINT IF EXISTS newsletter_reactions_reaction_check;

ALTER TABLE newsletter_reactions
  ADD CONSTRAINT newsletter_reactions_reaction_check
  CHECK (reaction IN ('loved', 'useful', 'insightful', 'resonated', 'taking_action'));
