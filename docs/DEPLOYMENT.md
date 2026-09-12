# Deployment

## Production

The existing production deployment must remain untouched while `lalabella-system` is under development.

## Development

Work on the `lalabella-system` branch. Test changes independently before considering a merge to `main`.

## Deployment Checklist

- [ ] Confirm branch and commit
- [ ] Confirm no secrets were added
- [ ] Confirm navigation links
- [ ] Confirm authentication
- [ ] Confirm API/data access
- [ ] Confirm calculations and totals
- [ ] Confirm printing
- [ ] Confirm desktop behavior
- [ ] Confirm mobile behavior
- [ ] Confirm browser console has no new errors
- [ ] Confirm regression tests for the affected module
- [ ] Document the change in `docs/CHANGELOG.md`

## Rollback

Production changes should be introduced through reviewable commits so the previous known-good commit can be restored if a release causes a regression.
