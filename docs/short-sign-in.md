# Short sign-in branch

The default prototype flow takes a USC email and continues immediately. There is no password field, email delivery, login code, or check-your-inbox screen. This preserves Thomas's original unverified prototype access and does not authenticate the address.

The new card uses TripMatch branding and a cardinal top border inspired by the reference. It does not copy USC's credential form or collect NetID passwords.

## Official USC sign-in

The optional SSO mode redirects through Supabase to a registered identity provider. USC renders the real credential screen. An ordinary link to login.usc.edu cannot connect a TripMatch session by itself.

Before enabling:

1. Arrange the application's USC identity-provider integration with USC ITS and register that SAML provider for `usc.edu` in this Supabase project. Check that the project's plan supports SAML SSO.
2. Add the deployed app's root URL to Supabase Auth's allowed redirect URLs.
3. Set `VITE_USC_SSO_ENABLED=true` in the build environment, rebuild, and redeploy. This one flag controls both the browser and server checks. Leave it unset for the current prototype.
4. Test the real USC redirect and return, verified USC email, session restoration, sign-out, and expired sessions. Verify that anonymous requests and attempts to access another user's profile/proposal fail.

SSO mode ignores the old `tm_email` browser value. Profile saves use the verified email, and every existing trip function checks a verified session and the relevant owner/participant access. SSO errors stay on the sign-in screen and never fall back to prototype access. No backend configuration has been changed by this branch.

This remains a competition prototype: match candidates still come from the repository's sample profiles and accepting a plan still uses its existing one-sided confirmation logic.

Documentation: https://supabase.com/docs/reference/javascript/auth-signinwithsso
