// Enable only after USC's identity provider is registered in this Supabase project.
export const uscSsoEnabled = import.meta.env['VITE_USC_SSO_ENABLED'] === 'true';
export const isUscEmail = (email: string) => /^[^@\s]+@usc\.edu$/i.test(email.trim());
