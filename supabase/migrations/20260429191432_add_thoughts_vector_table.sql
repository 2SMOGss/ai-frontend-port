-- Add Vector Extension and Thoughts Table for Open Brain Memory
-- NIST AC-2: Enforce Principle of Least Privilege (service_role only)

create extension if not exists vector;

create table thoughts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  metadata jsonb default '{}'::jsonb,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Security: Enable RLS and lock down the anon role
alter table thoughts enable row level security;

-- Policy: Only allow the authenticated service role to read/write thoughts
create policy "Only authenticated service role can read/write" 
on thoughts for all using (auth.role() = 'service_role');
