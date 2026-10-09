Tweakerzzz 0.6.1 fixes plans blocked by protected registry keys.

- Existing keys now request only the access needed to change their values.
- A permission preflight checks selected tweaks before any preferences change.
- Blocked tweaks are named in the review with a Remove blocked tweaks button.
- Review and apply the remaining plan yourself; blocked tweaks are never silently skipped or automatically retried.
- Edge background mode and startup boost include a manual settings guide when their policy key is protected.
- Late permission failures still roll back the transaction before offering a smaller plan.
- Restore center uses the same handling for disabling tweaks and returning to defaults.

Windows access restrictions are respected; registry ownership and permissions are left intact. Your profiles, backups and FPS recordings are preserved. This is an unsigned Windows x64 tester build.

On v0.6.0, use Updates → Check for updates → Download → Review installation → Install & restart. Older versions need a manual installer upgrade.
