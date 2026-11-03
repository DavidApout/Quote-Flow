# Demo profiles and ratings

In Settings, both signed-in customers and business owners can upload a profile
picture and banner, edit a 300-character bio, preview the result, and save.
JPG, PNG, and WebP files up to 8 MB are center-cropped in the browser and converted
to JPEG. Avatars are 320×320; banners are 1200×360. Each encoded image is capped
at 500,000 characters. Images and bios persist in the existing SQLite database.
They are not uploaded to an external image service.

Signed-in customers see the selected business profile. Request cards offer
“View customer profile” / “View business profile.” Customer profiles are readable
only by the customer and business owners who have a quote with that customer.
Business profiles are visible to signed-in accounts. Responses omit email and
credentials; profile updates always apply to the authenticated account.

After acceptance, each participant can rate the other party from 1 to 5 stars.
One rating per author per quote; saving again updates it. Profile averages and
counts are calculated from stored ratings. No seed/fake ratings. These are demo
quote-experience ratings, not verified fulfillment reviews. Unrelated users,
pending quotes, invalid scores, and client-supplied recipient overrides cannot
create ratings. Anonymous widget guests do not have profile editors or rating
controls in this version.

Limitations: names/email remain read-only; no image crop positioning, image
moderation, review text, reporting/disputes, production review-abuse controls,
or object storage/CDN. Repeated accepted quotes can each receive feedback.
Images are embedded in profile JSON, appropriate for a small demo rather than
large-scale hosting. Include the database in backups.

Validation: 39 automated tests passed, including profile access and rating
eligibility/ownership checks; lint, build, and diff formatting checks passed.
Browser verification of the new upload/editor UI was unavailable in this session.
