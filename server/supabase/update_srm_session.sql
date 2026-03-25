-- Update SRM session table to support multiple user sessions
ALTER TABLE public.srm_session 
ADD COLUMN IF NOT EXISTS user_id TEXT UNIQUE;

-- Initial row for those without a registration index (generic pre-login)
INSERT INTO public.srm_session (user_id, csrf_token, cookies)
VALUES ('generic', '', '')
ON CONFLICT (user_id) DO NOTHING;
