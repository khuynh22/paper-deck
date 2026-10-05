# Library views and private collections

`/library` accepts `q`, `status=to_read|reading|done`, `sort=newest|oldest|title`,
`collection=<UUID>` and `page`. Invalid values reset with a visible message.
Filters combine on the server and forms reset paging. Pages show 40 rows with an
extra-row next-page check, stable UUID ties and the same bounded offset policy as
discovery. Displayed counts are not total-library counts.

A saved paper without progress is **To read**. Each paper has a Reading status
control. Changing that status writes only identity, status and update time;
scroll position, read depth, anchors, marks and notes remain intact. Completion
remains explicit rather than being inferred from a percentage. Completed papers
remain searchable and can be reopened or changed back to Reading/To read.

Collections are private, named groups of saved papers. Names are trimmed, limited
to 80 characters and unique for an owner ignoring case and surrounding spaces.
A saved paper may belong to several collections. All saved remains available.
Deleting a collection deletes only that collection and its memberships; it does
not unstar papers or erase notes/progress. Unstarring a paper removes its collection
memberships while leaving its reading state and notes intact.

Migration 0013 applies owner RLS to both tables. Memberships carry composite foreign
keys to the owner's collection and star, preventing a user from linking an owned
membership row to another user's collection. Server actions authenticate every
write, bind ownership on the server, validate identifiers/names, and acknowledge
success only after storage accepts the mutation. Collection creation uses a stable
request UUID for retries. Errors retain drafts and expose retry controls.

The SQL regression covers combined library filters, more than 40 tied rows,
no-progress mapping, explicit completion, private reads/writes and collection
deletion preservation. Browser cases cover collection CRUD, multiple membership,
cross-user RLS/FK attacks, status-only persistence, search/status/sort pagination
and Back/reload URL restoration on desktop and mobile.
