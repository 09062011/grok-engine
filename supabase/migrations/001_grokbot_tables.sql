-- Grokbot AI Engine Cloud Persistence Schema for Supabase
-- Run this migration in the Supabase SQL Editor

-- 1. Conversation Threads
CREATE TABLE IF NOT EXISTS grokbot_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Chat Messages
CREATE TABLE IF NOT EXISTS grokbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES grokbot_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  name TEXT,
  tool_calls TEXT,
  tool_call_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_grokbot_messages_thread_created 
ON grokbot_messages (thread_id, created_at ASC);

-- 3. Long-term & Essential Memory
CREATE TABLE IF NOT EXISTS grokbot_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id TEXT,
  text TEXT NOT NULL,
  inclusion TEXT NOT NULL DEFAULT 'searchable' CHECK (inclusion IN ('essential', 'searchable')),
  origin TEXT NOT NULL DEFAULT 'automatic' CHECK (origin IN ('manual', 'automatic')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_grokbot_memories_essential 
ON grokbot_memories (user_id, agent_id, inclusion, origin);

-- Full-text search index on memories
CREATE INDEX IF NOT EXISTS idx_grokbot_memories_fts 
ON grokbot_memories USING GIN (to_tsvector('english', text));

-- Row Level Security (RLS)
ALTER TABLE grokbot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE grokbot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE grokbot_memories ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own threads
CREATE POLICY "Users can manage own threads" 
ON grokbot_threads FOR ALL USING (auth.uid() = user_id);

-- Allow users to manage messages belonging to their threads
CREATE POLICY "Users can manage own messages" 
ON grokbot_messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM grokbot_threads 
    WHERE grokbot_threads.id = grokbot_messages.thread_id 
    AND grokbot_threads.user_id = auth.uid()
  )
);

-- Allow users to manage their own memories
CREATE POLICY "Users can manage own memories" 
ON grokbot_memories FOR ALL USING (auth.uid() = user_id);
