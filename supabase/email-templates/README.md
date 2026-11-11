# Maestro email templates (Supabase Auth)

Paste each file into **Supabase → Authentication → Emails → Templates**. Set the subject, switch the editor to source/HTML, paste the whole file, save.

| Supabase template | Subject | File |
|---|---|---|
| Confirm signup | Confirm your email for Maestro | `confirm-signup.html` |
| Magic link | Your Maestro sign-in link | `magic-link.html` |
| Reset password | Reset your Maestro password | `reset-password.html` |
| Change email address | Confirm your new email for Maestro | `change-email.html` |
| Invite user | You are invited to Maestro | `invite.html` |
| Reauthentication | Your Maestro confirmation code | `reauthentication.html` |

Built for every inbox: table layout, inline styles, no images (the logo is drawn with table cells), a bulletproof
button that also works in Outlook for Windows, light colors that stay readable when mail apps force dark mode,
and the link written out under the button in case a mail app blocks buttons.

Reauthentication sends a 6-digit code ({{ .Token }}); the other emails use one button and the written-out link.

`preview.html` shows all six with sample values (open it in a browser). It is not used by Supabase.
