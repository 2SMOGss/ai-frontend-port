-- Allow the 'anon' role (public visitors) to read thoughts for the portfolio display.
-- This is necessary for the 'Neural Stream' and 'Memories' count to function in the frontend.
-- NIST AC-2: Explicitly granting minimum necessary permission (SELECT only).

CREATE POLICY "Allow public read access to thoughts"
ON public.thoughts FOR SELECT
TO anon
USING (true);

-- Also grant the necessary table permission to the 'anon' role
GRANT SELECT ON public.thoughts TO anon;
