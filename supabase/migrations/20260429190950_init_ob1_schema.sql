-- OB1 (Open Brain) Infrastructure - Initial Schema
-- Guiding Principle: NIST-800-53 (AC, AU, SC families)

-- Enable necessary extensions for security and ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Table: mcp_servers
-- Stores registered Model Context Protocol (MCP) servers
CREATE TABLE public.mcp_servers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    endpoint_url TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- NIST AC-2: Enforce Principle of Least Privilege via Row Level Security (RLS)
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read access to authenticated users
CREATE POLICY "Allow read access for authenticated users" 
ON public.mcp_servers FOR SELECT 
TO authenticated 
USING (true);

-- Policy: Allow all operations for the creator
CREATE POLICY "Allow write access for creators" 
ON public.mcp_servers FOR ALL 
TO authenticated 
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Table: mcp_audit_logs
-- NIST AU-2: Audit events for MCP server connections and queries
CREATE TABLE public.mcp_audit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    server_id UUID REFERENCES public.mcp_servers(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id),
    event_type TEXT NOT NULL, -- e.g., 'CONNECTION', 'QUERY', 'ERROR'
    event_details JSONB,
    ip_address TEXT,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

-- NIST AC-2: Enforce RLS on audit logs to prevent tampering
ALTER TABLE public.mcp_audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own audit logs; no one can update/delete
CREATE POLICY "Users can view their own audit logs"
ON public.mcp_audit_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs"
ON public.mcp_audit_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Function to automatically update 'updated_at' timestamp (NIST CM / AU)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auditing modifications
CREATE TRIGGER update_mcp_servers_modtime
    BEFORE UPDATE ON public.mcp_servers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
