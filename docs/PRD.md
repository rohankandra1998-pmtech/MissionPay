# MissionPay Product Requirements Document

**Product:** MissionPay  
**Tagline:** Give with purpose. Pay with confidence.  
**Vertical:** Donations and online fundraising  
**Primary market:** United States  
**Document purpose:** Source of truth for the first production-quality MissionPay prototype  
**Build environment:** ChatGPT Codex  
**Payments:** Juspay Hyperswitch hosted sandbox  
**Database and backend:** Supabase  
**Frontend:** React, Vite, TypeScript, Tailwind CSS  
**Design skill:** `gpt-tasteskill` from Taste Skill  
**Source control:** GitHub  
**Deployment target:** Vercel  
**Status:** MVP Build Specification

---

# 1. Product Summary

MissionPay is a two-sided online fundraising platform that enables:

1. **Fundraisers** to create, publish, and manage fundraising campaigns.
2. **Donors** to discover campaigns and make secure one-time or monthly recurring donations.

The central product experience is not simply a donation form. MissionPay must demonstrate a complete payment lifecycle in which:

- A fundraiser publishes a real campaign.
- A donor selects a campaign.
- A donor makes a real sandbox payment through Juspay Hyperswitch.
- MissionPay records the payment lifecycle.
- The donation becomes successful only when its payment state is reliably confirmed.
- Campaign fundraising totals update from actual successful donation records.
- The fundraiser sees the resulting donation in their dashboard.
- For monthly donations, MissionPay stores the appropriate Hyperswitch payment references and executes future merchant-initiated recurring charges according to the donor's authorization.

The application must look and behave like a credible product that could plausibly be launched, not like a payment API demo.

---

# 2. Product Vision

MissionPay should make online giving feel:

- Trustworthy
- Human
- Fast
- Transparent
- Secure
- Purpose-driven

The donor should understand:

> Who am I helping, what will my contribution accomplish, and can I confidently complete this payment?

The fundraiser should understand:

> How is my campaign performing, who is contributing, and what is the status of the money being raised?

The payment experience must support the product experience rather than appearing as a disconnected technical component.

---

# 3. Core Product Principles

## 3.1 Trust before transaction

A donor should see meaningful campaign information before being asked for payment.

Campaign pages should communicate:

- Fundraiser identity
- Campaign story
- Fundraising target
- Amount raised
- Number of donors
- Intended impact
- Campaign imagery
- Fundraiser verification state
- Recent supporter activity where appropriate

## 3.2 Minimize donation friction

A donor must **not be required to create an account before donating**.

Guest checkout is the default donor experience.

Required information should be limited to what is necessary for the transaction and donation record.

## 3.3 Payments are backend-authoritative

MissionPay must never mark a donation as successful purely because the browser reports success.

Payment state must ultimately reconcile with Hyperswitch.

## 3.4 Separate business state from payment state

A MissionPay donation is a business object.

A Hyperswitch payment is a payment infrastructure object.

MissionPay must maintain the relationship between the two without treating them as the same entity.

## 3.5 No sensitive card storage in MissionPay

MissionPay must never store:

- Raw card number
- CVV
- Full payment instrument details

Hyperswitch handles sensitive payment credentials and tokenization.

## 3.6 Recurring giving requires explicit consent

Monthly donations must clearly communicate:

- Donation amount
- Monthly frequency
- First charge timing
- Future automatic charge behavior
- Cancellation capability

There must be no hidden conversion from one-time giving to recurring giving.

---

# 4. MVP Stakeholders

## 4.1 Donor

A person visiting MissionPay because they want to financially support a cause.

The donor may:

- Browse campaigns
- View campaign details
- Donate once
- Donate monthly
- Donate anonymously
- Complete payment
- Receive confirmation
- View or manage a recurring donation

The donor does not need a MissionPay account before donating.

---

## 4.2 Fundraiser

A person or organization raising money through MissionPay.

The fundraiser must authenticate before accessing management features.

The fundraiser may:

- Sign up or sign in
- Create campaigns
- Save campaigns as drafts
- Publish campaigns
- View campaign performance
- View donations
- See one-time vs recurring giving
- Monitor payment states
- See recurring donor status

For the MVP, a fundraiser is a **MissionPay business stakeholder**, but does not need to be implemented as an independent Hyperswitch merchant account.

MissionPay can operate through the configured Hyperswitch sandbox merchant while maintaining internal ownership relationships between fundraisers and campaigns.

Multi-merchant onboarding, KYB, settlement routing, and fundraiser payouts are explicitly outside this first build.

---

# 5. Primary MVP User Journey

## Donor journey

```text
MissionPay Landing Page
        |
        v
Discover Campaigns
        |
        v
Campaign Detail Page
        |
        v
Click "Donate"
        |
        v
Choose Frequency
  |             |
  v             v
One-time      Monthly
  |             |
  +------v------+
         |
Choose Amount
$25 / $50 / $100 / $250 / Custom
         |
         v
Enter Donor Details
         |
         +--> Name
         +--> Email
         +--> Anonymous toggle
         |
         v
Review Donation
         |
         v
Hyperswitch Unified Checkout
         |
         v
Complete Payment
         |
         v
Processing
    |          |
    v          v
Success      Failure
    |          |
    |          +--> Error explanation
    |               Retry payment
    |
    v
MissionPay Confirmation
    |
    +--> Donation amount
    +--> Campaign
    +--> Frequency
    +--> Confirmation reference
    +--> Impact message
    +--> Recurring management if monthly
```

---

# 6. Fundraiser Journey

```text
MissionPay
    |
    v
Fundraiser Authentication
    |
    v
Dashboard
    |
    +--> Campaign performance
    +--> Donation metrics
    +--> Recent donations
    +--> Recurring supporters
    |
    v
Create Campaign
    |
    +--> Campaign title
    +--> Category
    +--> Fundraising goal
    +--> Story
    +--> Cover image
    +--> End date
    +--> Impact statement
    |
    v
Preview Campaign
    |
    v
Publish Campaign
    |
    v
Public Campaign Page
    |
    v
Donors Contribute
    |
    v
Hyperswitch Payment
    |
    v
MissionPay Records Outcome
    |
    v
Fundraiser Dashboard Updates
```

---

# 7. Mandatory MVP Scope

The following features **must exist in the first complete build**.

## Donor

- Landing page
- Campaign discovery
- Campaign detail page
- Suggested donation amounts
- Custom donation amount
- One-time donations
- Monthly recurring donations
- Guest donation flow
- Donor name
- Donor email
- Anonymous donation option
- Donation review step
- Hyperswitch sandbox payment
- Processing state
- Successful donation state
- Failed payment state
- Retry flow
- Donation confirmation page
- Monthly donation management/cancellation mechanism

## Fundraiser

- Authentication
- Fundraiser dashboard
- Create campaign
- Edit draft campaign
- Publish campaign
- Campaign performance
- Successful donation activity
- Payment status visibility
- One-time vs recurring breakdown
- Recurring supporter visibility

## Backend

- Supabase PostgreSQL
- Supabase migrations
- Row Level Security
- Supabase Edge Functions
- Hyperswitch server-side integration
- Payment webhook processing
- Idempotent webhook handling
- Recurring-donation scheduling
- Secure environment variables
- Business/payment state reconciliation

---

# 8. Donation Frequency

The donation experience must prominently provide:

```text
[ One-time ]    [ Monthly ]
```

Neither option should be visually misleading.

The default can be **One-time**.

Monthly giving is mandatory in the MVP.

---

# 9. One-Time Donation Flow

## Step 1

The donor selects:

- Campaign
- Donation amount
- Name
- Email
- Anonymous preference

## Step 2

MissionPay creates an internal donation record with:

```text
status = pending
frequency = one_time
```

## Step 3

MissionPay backend creates a corresponding payment through Hyperswitch.

## Step 4

The frontend receives only the information required to securely render and complete Hyperswitch checkout.

The Hyperswitch secret key must never reach the browser.

## Step 5

The donor completes payment.

## Step 6

MissionPay transitions the donation through appropriate states such as:

```text
pending
processing
succeeded
failed
```

## Step 7

Successful donations update campaign fundraising progress.

Only successful captured donation amounts count toward campaign totals.

---

# 10. Monthly Recurring Donation Flow

Monthly recurring donations are a first-class MVP feature.

Hyperswitch recurring payment architecture separates the initial customer-initiated payment from later merchant-initiated payments. Hyperswitch supports saving payment information for future off-session usage and later MIT execution using recurring reference information. The recurring schedule itself remains under merchant control.

MissionPay will own the monthly billing schedule.

## 10.1 Donor experience

The donor selects:

```text
Monthly
```

and sees clear copy similar to:

> Donate $50 today and $50 every month until you cancel.

The exact amount must be visible before payment.

The donor must explicitly consent to recurring billing.

Example checkbox:

```text
[ ] I authorize MissionPay to charge $50 today and $50 each month until I cancel.
```

Do not pre-check this checkbox.

---

## 10.2 Initial monthly transaction

The first monthly donation occurs immediately.

The transaction is a customer-initiated transaction.

MissionPay must:

1. Create or associate a Hyperswitch customer.
2. Create the payment.
3. Request future off-session usage.
4. Capture appropriate donor consent.
5. Complete the first payment through Hyperswitch.
6. Store only Hyperswitch references required for future recurring charges.
7. Never store raw card credentials.
8. Activate the recurring donation only after successful setup/payment confirmation.

Conceptually:

```text
Donor
  |
  v
Monthly $50 selected
  |
  v
MissionPay backend
  |
  v
Hyperswitch CIT
First $50 charge
+ save for future off-session usage
  |
  v
Successful payment
  |
  v
Recurring Donation = ACTIVE
  |
  v
next_charge_at = next monthly billing date
```

---

# 11. Future Monthly Charges

Hyperswitch supports merchant-initiated recurring transactions through off-session payments using recurring reference data.

MissionPay must implement a recurring billing worker.

Supabase supports scheduled Edge Function execution using hosted Postgres scheduling capabilities such as `pg_cron` and `pg_net`.

Recommended architecture:

```text
Supabase scheduled job
        |
        v
process-recurring-donations
        |
        v
Find ACTIVE recurring donations
where next_charge_at <= now()
        |
        v
Create new MissionPay donation
        |
        v
Create Hyperswitch MIT
off_session = true
        |
        v
Hyperswitch processes payment
        |
        v
Webhook/result reconciliation
        |
   +----+----+
   |         |
   v         v
Success    Failure
   |         |
   v         v
Update     Mark billing
next date  issue/past_due
```

Each monthly charge must create a **new donation transaction record**.

Do not simply increment a recurring counter.

This allows:

- Accurate payment history
- Auditing
- Campaign totals
- Individual failure tracking
- Refundability
- Better fundraiser reporting

---

# 12. Recurring Donation Billing Rules

For MVP:

- Frequency: monthly only
- Initial donation: charged immediately
- Future billing date: same calendar date each month where possible
- Currency: USD
- Amount: fixed at subscription creation
- Automatic amount modification: not supported in MVP
- Pausing: deferred
- Cancellation: supported
- Automatic failed-payment retry strategy: deferred
- Failed recurring charge should surface as `past_due` or equivalent MissionPay status

An active recurring plan requires non-empty provider customer and reusable payment-method references. A successful initial donation without a reusable method remains a successful donation, but future monthly setup is incomplete and no automatic charge date is advertised. Unified Checkout keeps its provider-managed save-card consent visible and defaults it on only for monthly donations.

For dates such as the 29th, 30th, or 31st, billing logic should use a deterministic end-of-month-safe strategy.

For example, if the corresponding date does not exist, charge on the final calendar day of the target month.

---

# 13. Monthly Donation Cancellation

A donor must have a way to stop future recurring charges.

Cancellation must:

1. Set the MissionPay recurring donation status to `cancelled`.
2. Prevent future MissionPay scheduled MIT execution.
3. Preserve historical successful donation records.
4. Preserve the audit trail.
5. Clearly tell the donor that previous donations are unaffected.

For the MVP, checkout-generated links use a secure opaque management token whose SHA-256 hash is stored. Monthly receipt emails use a backend-signed HMAC-SHA256 capability generated during rendering because the original opaque token is intentionally unrecoverable. The signed payload contains only its version, management purpose, and recurring donation UUID; the signing secret and raw capabilities are never stored or exposed client-side.

Example route:

```text
/manage-donation/:token
```

The token must:

- Be cryptographically random
- Be unguessable
- Not contain raw donor information
- Be handled carefully in database access

The management page should show:

- Campaign
- Monthly amount
- Status
- Start date
- Next charge date
- Cancel monthly donation

Cancellation requires a second, explicit affirmative in-app choice. The safer choice must perform no mutation, and cancellation must remain idempotent.

Every successful donation receives its own confirmation email. Each initial or subsequent monthly success includes current plan status and a management link. A receipt queued before later cancellation or `past_due` transition must still send; only an active plan presents a next charge date. One-time receipts contain no recurring-management control.

Do not expose payment credentials, raw management capabilities, or the signing secret.

---

# 14. Payment Methods

## One-time donation

Target:

- Credit card
- Debit card
- Apple Pay when eligible/configured
- Google Pay when eligible/configured

Hyperswitch supports Unified Checkout and can surface configured payment methods according to merchant and checkout context.

Wallet visibility must be capability-driven rather than hard-coded.

Do not display a wallet button that cannot actually be used.

## Monthly donation

For the first MVP, prioritize:

- Credit card
- Debit card

Monthly wallet recurring support is not required for MVP.

The reason is product and implementation clarity: the first recurring build should establish a deterministic card-on-file and off-session recurring payment flow.

---

# 15. Hyperswitch Integration Requirements

Use the **Hyperswitch hosted sandbox**.

Required technical references:

```text
https://docs.hyperswitch.io/
https://github.com/juspay/hyperswitch
https://api-reference.hyperswitch.io/introduction
```

Codex must review current official Hyperswitch documentation before implementing payment APIs.

Do not infer API payloads from memory if official documentation differs.

---

# 16. Hyperswitch Checkout

Use the official Hyperswitch web/React integration.

Preferred checkout architecture:

```text
React frontend
      |
      v
MissionPay Edge Function
      |
      v
Hyperswitch Create Payment
      |
      v
client_secret / safe client data
      |
      v
React
      |
      v
Hyperswitch Unified Checkout
```

Do not call privileged Hyperswitch APIs directly from the browser.

---

# 17. Payment Source of Truth

MissionPay owns:

- Campaign
- Donor
- Donation
- Recurring donation
- Fundraiser relationship
- Donation frequency
- Campaign progress

Hyperswitch owns the payment orchestration state.

MissionPay stores relevant Hyperswitch identifiers for reconciliation.

Example:

```text
MissionPay donation
        |
        +--> hyperswitch_payment_id
        |
        +--> MissionPay status
```

The application should reconcile payment outcomes rather than duplicate payment logic.

---

# 18. Webhook Architecture

Create a Supabase Edge Function such as:

```text
hyperswitch-webhook
```

Supabase Edge Functions are appropriate for third-party webhook receivers and server-side integrations. External webhooks should validate the provider's authentication/signature within the handler rather than trusting arbitrary incoming requests.

The function should:

1. Receive Hyperswitch webhook event.
2. Verify authenticity according to current Hyperswitch documentation.
3. Check whether the event has already been processed.
4. Store the event.
5. Locate the corresponding payment attempt.
6. Update payment attempt status.
7. Update donation status.
8. Activate recurring donation if appropriate.
9. Update campaign-derived metrics indirectly through successful donation data.
10. Return success quickly.

Webhook handling must be idempotent.

Duplicate events must not double-count donation amounts.

---

# 19. Recommended Database Model

## `fundraisers`

```text
id UUID PK
user_id UUID FK -> auth.users
display_name TEXT
organization_name TEXT nullable
bio TEXT nullable
avatar_url TEXT nullable
verification_status TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Suggested verification states:

```text
unverified
pending
verified
```

Verification can be seeded/demo-controlled in MVP.

Full KYB is deferred.

---

## `campaigns`

```text
id UUID PK
fundraiser_id UUID FK
slug TEXT UNIQUE
title TEXT
short_description TEXT
story TEXT
category TEXT
goal_amount_cents BIGINT
currency TEXT DEFAULT 'USD'
cover_image_url TEXT
impact_statement TEXT
status TEXT
end_date TIMESTAMPTZ nullable
published_at TIMESTAMPTZ nullable
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Statuses:

```text
draft
published
closed
```

---

## `donors`

```text
id UUID PK
name TEXT
email TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Do not publicly expose donor email.

---

## `donations`

Every financial contribution is represented by one donation record.

```text
id UUID PK
campaign_id UUID FK
donor_id UUID FK
recurring_donation_id UUID nullable
amount_cents BIGINT
currency TEXT DEFAULT 'USD'
frequency TEXT
is_anonymous BOOLEAN
status TEXT
hyperswitch_payment_id TEXT nullable
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
completed_at TIMESTAMPTZ nullable
```

Frequency:

```text
one_time
monthly
```

Statuses:

```text
pending
processing
succeeded
failed
cancelled
refunded
```

---

## `recurring_donations`

```text
id UUID PK
campaign_id UUID FK
donor_id UUID FK
amount_cents BIGINT
currency TEXT DEFAULT 'USD'
status TEXT
hyperswitch_customer_id TEXT nullable
hyperswitch_payment_method_reference TEXT nullable
hyperswitch_recurring_reference JSONB nullable
started_at TIMESTAMPTZ
next_charge_at TIMESTAMPTZ
cancelled_at TIMESTAMPTZ nullable
management_token_hash TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Do not store sensitive payment instrument data.

Statuses:

```text
pending
active
past_due
cancelled
```

---

## `payment_attempts`

A donation may have more than one attempt if retry is required.

```text
id UUID PK
donation_id UUID FK
hyperswitch_payment_id TEXT
attempt_number INTEGER
status TEXT
error_code TEXT nullable
error_message TEXT nullable
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

---

## `payment_events`

Used for payment auditability and webhook idempotency.

```text
id UUID PK
provider TEXT DEFAULT 'hyperswitch'
provider_event_id TEXT UNIQUE
event_type TEXT
payment_attempt_id UUID nullable
payload JSONB
processed_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

Never expose raw webhook payloads to public clients.

---

# 20. Campaign Metrics

Campaign totals must be derived from successful donations.

## Amount raised

```text
SUM(donations.amount_cents)
WHERE donations.status = 'succeeded'
```

## Donor count

Use successful donation relationships.

Define clearly whether this is:

- Unique donors
- Total successful donations

For the public UI, prefer **supporter count**, based on unique donors where practical.

## Average donation

```text
successful donation amount / successful donation count
```

## Recurring supporters

Count:

```text
recurring_donations.status = 'active'
```

Do not hard-code dashboard financial metrics.

---

# 21. Required Supabase Edge Functions

Recommended functions:

```text
create-payment
hyperswitch-webhook
process-recurring-donations
cancel-recurring-donation
```

Optional:

```text
create-campaign
publish-campaign
```

Campaign CRUD may use Supabase APIs directly where RLS makes this safe.

---

# 22. `create-payment` Responsibilities

The backend must not trust price information supplied blindly by the frontend.

The function should:

1. Validate request.
2. Fetch campaign.
3. Confirm campaign is published.
4. Validate donation amount.
5. Confirm USD.
6. Normalize donor data.
7. Create/find donor record.
8. For monthly giving, retrieve or create the donor's stable Hyperswitch customer; reuse it across independent recurring agreements and do not couple it to cancellation.
9. For monthly giving, create the recurring setup record only after customer resolution succeeds.
10. Create the donation record.
11. Create Hyperswitch payment.
12. Store Hyperswitch payment ID.
13. Create payment attempt.
14. Return safe checkout information.

Never return:

- Hyperswitch secret API key
- Supabase service-role/secret key
- Sensitive provider credentials

---

# 23. `process-recurring-donations` Responsibilities

This function should be server-only.

Responsibilities:

1. Find active recurring donations due for billing.
2. Lock or otherwise guard against duplicate concurrent processing.
3. Create a new donation record for the billing occurrence.
4. Create payment attempt.
5. Execute Hyperswitch merchant-initiated payment.
6. Store resulting payment ID.
7. Reconcile result.
8. Advance `next_charge_at` after successful billing.
9. Mark billing issue when unsuccessful.
10. Produce useful logs.

The implementation must be idempotent.

Running the scheduled job twice must not create two charges for the same billing period.

Use a unique billing-period key or equivalent database constraint.

---

# 24. Development-Only Recurring Test Harness

Waiting one month is impossible during an interview prototype.

Therefore development/sandbox mode may contain a protected developer-only mechanism to trigger a recurring billing cycle immediately.

Example:

```text
DEV ONLY
Run next recurring charge
```

This must:

- Be unavailable in normal public donor UI
- Be clearly labeled test-only
- Execute the real recurring backend path
- Use Hyperswitch sandbox
- Not replace the production scheduler implementation

This allows the interviewer to see:

```text
Initial monthly donation
        |
        v
Recurring plan active
        |
        v
Trigger next sandbox billing
        |
        v
Real Hyperswitch MIT
        |
        v
Second donation record
        |
        v
Campaign total increases
```

---

# 25. Authentication

## Fundraiser

Use Supabase Auth.

Fundraiser management pages require authentication.

Possible methods:

- Email/password
- Magic link

Choose the simplest reliable experience for the prototype.

## Donor

No authentication required before donation.

Recurring donation management uses secure opaque management access rather than forcing account creation.

---

# 26. Row Level Security

RLS must be enabled.

Public users may read only appropriate published campaign information.

Examples of intended access behavior:

## Public

Can read:

- Published campaigns
- Safe fundraiser public profile fields
- Aggregate campaign information

Cannot read:

- Donor emails
- Payment events
- Payment attempts
- Recurring payment references
- Private fundraiser information

## Authenticated fundraiser

Can:

- Read/update own fundraiser record
- CRUD own campaigns
- Read donation information for own campaigns as allowed by product requirements

Cannot:

- Modify another fundraiser's campaign
- Access another fundraiser's private data

## Service/backend

Edge Functions can perform privileged payment/database operations using secure server credentials.

Supabase's server-side secret credentials must stay in secure server environments and never be shipped to browser code.

---

# 27. Security Requirements

Mandatory:

- No Hyperswitch secret key in frontend
- No Supabase server secret in frontend
- No raw cards in database
- Input validation server-side
- RLS enabled
- Webhook verification
- Webhook idempotency
- Recurring billing idempotency
- Amount stored in cents/integer representation
- Currency explicitly stored
- Donation amount validated server-side
- Public campaign status validated server-side
- Secrets stored using environment variables/project secrets
- `.env` files excluded from Git

---

# 28. Frontend Technology

Use:

```text
React
Vite
TypeScript
Tailwind CSS
Supabase JS
Hyperswitch official React/web SDK
```

Use a routing solution appropriate for React.

Avoid unnecessary libraries.

Do not introduce a large component framework merely to accelerate development if it compromises design quality.

---

# 29. Taste Skill Requirement

The project will contain the **`gpt-tasteskill`** skill before frontend implementation begins.

Taste Skill describes `gpt-tasteskill` as a stable, stricter variant designed for GPT/Codex with stronger layout variation, motion direction, and anti-generic-output rules.

Codex must:

1. Locate and read the installed `gpt-tasteskill` `SKILL.md`.
2. Treat it as the frontend design execution framework.
3. Follow the MissionPay product requirements in this PRD as the source of product truth.
4. Apply Taste Skill to visual composition, spacing, hierarchy, motion, and polish.
5. Run its design pre-flight checks before considering frontend work complete.

Required reference:

```text
https://www.tasteskill.dev/
```

---

# 30. MissionPay Visual Direction

MissionPay should feel like a combination of:

- Trusted financial infrastructure
- Modern fundraising platform
- Human storytelling product

Avoid:

- Generic SaaS landing page appearance
- AI-purple gradients
- Excessive glassmorphism
- Giant rounded cards everywhere
- Three-identical-feature-card layouts
- Fake dashboard elements
- Decorative metrics without meaning
- Excessive pills
- Excessive gradients
- Tech/startup aesthetics that overpower the causes
- Charity clichés
- Manipulative urgency

Prefer:

- Strong editorial hierarchy
- Human campaign photography
- Generous whitespace
- High readability
- Meaningful information density
- Restrained motion
- One coherent accent color system
- Clear financial states
- Strong accessible contrast
- Real data wherever a metric is displayed

---

# 31. Brand Personality

MissionPay is:

```text
Trustworthy
Optimistic
Purposeful
Modern
Human
Calm
Transparent
```

MissionPay is not:

```text
Corporate banking
Crypto
Aggressive fintech
Crowdfunding chaos
Overly sentimental
Playful at the expense of trust
```

---

# 32. Suggested Visual System

The final implementation should allow `gpt-tasteskill` to make detailed design decisions, but use this direction:

## Base

Warm neutral/off-white surfaces.

## Typography

Strong editorial headings paired with highly readable UI/body typography.

## Accent

One restrained purpose/trust-oriented accent.

A green or green-adjacent direction is suitable, but avoid generic bright startup green.

## Shapes

Use a coherent radius system.

Do not make every element pill-shaped.

## Imagery

Campaign photography is a primary emotional surface.

Use high-quality cause-relevant imagery.

Do not use generic abstract illustrations as campaign imagery.

---

# 33. Public Navigation

Recommended desktop navigation:

```text
MissionPay

Discover
How it works

For Fundraisers

Sign in
Start a fundraiser
```

Keep navigation simple.

The primary donor action should still be campaign discovery rather than fundraiser onboarding.

---

# 34. Required Pages

## Public

```text
/
 /campaigns
 /campaigns/:slug
 /donate/:campaignId
 /donation/:donationId/success
 /manage-donation/:token
```

## Fundraiser

```text
/login
/signup

/dashboard
/dashboard/campaigns
/dashboard/campaigns/new
/dashboard/campaigns/:id
/dashboard/donations
```

Routes may be refined if implementation needs justify it, but do not silently remove required flows.

---

# 35. Landing Page

Purpose:

Help donors quickly understand MissionPay and discover meaningful campaigns.

Required areas:

- Navigation
- Hero
- Clear mission statement
- Campaign discovery
- Featured campaigns
- How giving works
- Trust/payment reassurance
- Fundraiser CTA
- Footer

Suggested hero direction:

**Give with purpose. Pay with confidence.**

Supporting copy should be concise and human.

Avoid treating the hero as a technical Hyperswitch showcase.

Hyperswitch can be acknowledged subtly in payment/trust contexts, but MissionPay remains the consumer-facing product.

---

# 36. Campaign Discovery Page

Must support:

- Campaign cards
- Cover image
- Campaign name
- Short description
- Amount raised
- Goal
- Progress
- Category
- Fundraiser
- Clear navigation to details

Seed multiple realistic campaigns.

Recommended initial seed count:

```text
4 to 6 campaigns
```

Use varied categories such as:

- Medical support
- Education
- Disaster relief
- Community
- Animal welfare
- Environment

Only one or two campaigns need active demo donation activity.

---

# 37. Campaign Detail Page

Required:

- Hero/cover image
- Campaign title
- Fundraiser identity
- Verification indicator if verified
- Campaign story
- Impact statement
- Amount raised
- Goal
- Progress visualization
- Supporter count
- Donation CTA
- Recent supporters
- Share affordance
- Donation module

Example:

```text
$12,450 raised of $20,000

183 supporters

[ Donate now ]
```

Do not fabricate dynamically changing values in frontend code.

Use Supabase-backed data.

---

# 38. Donation Amount Experience

Suggested presets:

```text
$25
$50
$100
$250
Custom
```

A donor may choose any valid amount within defined bounds.

Suggested MVP bounds:

```text
Minimum: $1
Maximum: $10,000
```

Validate bounds server-side.

If Hyperswitch sandbox or connector limitations require different values, follow official documentation and document the deviation.

---

# 39. Donor Information

Collect:

```text
Full name
Email
Anonymous donation toggle
```

For anonymous donations:

- MissionPay may retain donor information privately for payment/operational purposes.
- Public and fundraiser-facing presentation should show "Anonymous" where appropriate.

Do not treat anonymous as "do not collect email".

Payment/receipt operations may still require contact information.

---

# 40. Donation Review

Before payment, show:

```text
Campaign
Donation amount
Frequency
Donor identity setting
```

For monthly:

```text
$50 today
$50 every month
```

Include recurring consent.

Then continue to Hyperswitch payment.

---

# 41. Checkout Experience

The Hyperswitch checkout must visually integrate cleanly with MissionPay.

It should not feel like the donor has entered a completely unrelated product.

Preserve:

- MissionPay page hierarchy
- Campaign context
- Donation amount
- Frequency
- Security reassurance

But do not interfere with or fake payment components that must be rendered by Hyperswitch.

---

# 42. Processing State

After submission, display a deliberate processing state.

Prevent accidental duplicate submission.

Example:

```text
Processing your donation...

Please do not close this window.
```

Do not immediately show success until state is confirmed sufficiently for the integration.

---

# 43. Success Page

Required:

- Thank-you message
- Donation amount
- Campaign
- Frequency
- Donation reference
- Payment success state
- Impact-oriented copy
- Return to campaign
- Share campaign

For monthly donations additionally show:

```text
Monthly donation active
Next donation date
Manage monthly donation
```

---

# 44. Failure State

Never show:

```text
Something went wrong.
```

as the only information.

Failure UI should provide:

- Human-readable explanation where possible
- Payment status
- Retry action
- Return to campaign
- Assurance that failed attempts were not counted as donations

Do not expose raw internal stack traces or sensitive processor details.

---

# 45. Fundraiser Dashboard

Dashboard must use real MissionPay data.

Required metrics:

```text
Total raised
Campaign goal
Goal progress
Successful donations
Active recurring supporters
Average successful donation
```

Required sections:

- Campaign summary
- Fundraising trend or useful activity visualization
- Recent donations
- Recurring supporters
- Payment status visibility

Example recent donation table:

```text
Donor            Amount    Frequency    Status
------------------------------------------------
Alex Morgan      $100      One-time     Succeeded
Anonymous        $50       Monthly      Succeeded
Jamie Lee        $250      One-time     Succeeded
Chris Walker     $75       Monthly      Processing
```

---

# 46. Campaign Creation

Required fields:

- Campaign title
- Category
- Short description
- Story
- Goal
- Cover image
- Impact statement
- Optional end date

Support:

```text
Save draft
Preview
Publish
```

A draft campaign must not be publicly discoverable.

---

# 47. Seed Data

Create meaningful seed data for demo purposes.

At least:

- 1 authenticated fundraiser demo account or easy signup flow
- 4 to 6 campaigns
- Mixed categories
- Realistic goals
- Realistic campaign narratives
- Existing seed successful donations for visual richness if needed

However:

**The primary demo campaign must visibly change based on actual new Hyperswitch sandbox transactions.**

Seed data must never disguise whether the tested payment actually succeeded.

---

# 48. Public Campaign Progress

When a successful payment completes:

Before:

```text
$12,450 raised
```

New donation:

```text
+$100
```

After backend reconciliation:

```text
$12,550 raised
```

The fundraiser dashboard and campaign page should reflect the same underlying successful donation data.

---

# 49. Refunds

Refund initiation UI is **not mandatory** for MVP.

However the architecture should allow donation status:

```text
refunded
```

and payment events should be able to represent future refund outcomes.

Document refund workflows in architecture/deferred scope.

---

# 50. Disputes and Chargebacks

Not required to build in the MVP UI.

The architecture document should acknowledge them as real payment lifecycle considerations.

Hyperswitch exposes post-transaction concepts including refunds, disputes, and unified payment error handling.

---

# 51. Explicitly Deferred Scope

Do not build these unless all mandatory functionality is complete:

- Multi-Hyperswitch-merchant architecture
- Fundraiser KYB
- Fundraiser bank account onboarding
- Real payouts to fundraisers
- Split payments
- Marketplace settlement
- Complex payout schedules
- Recurring amount editing
- Recurring pause/resume
- Sophisticated recurring retry/dunning
- Partial refunds
- Fundraiser refund administration
- Dispute management UI
- Tax-deductible receipt certification
- Employer donation matching
- Social login
- Advanced campaign moderation
- Campaign comments
- Donor social feed
- Native mobile application
- Multi-currency
- International payments
- AI-generated campaign writing

These should not distract from core payment correctness.

---

# 52. Analytics Events

Implement lightweight event tracking abstraction even if no external analytics provider is connected.

Suggested events:

```text
campaign_viewed
donate_clicked
donation_frequency_selected
donation_amount_selected
checkout_started
payment_submitted
payment_succeeded
payment_failed
monthly_donation_created
monthly_donation_cancelled
campaign_created
campaign_published
```

Do not send card or sensitive payment data into analytics.

---

# 53. Accessibility

Target strong accessibility practices.

Required:

- Keyboard navigation
- Visible focus states
- Semantic forms
- Proper labels
- Accessible error messages
- Sufficient contrast
- Alt text for meaningful campaign images
- ARIA only where necessary
- Responsive text sizing
- Payment state not conveyed through color alone

Taste Skill's current design guidance also emphasizes accessible contrast and coherent hierarchy.

---

# 54. Responsive Requirements

MissionPay must be production-quality on:

- Desktop
- Tablet
- Mobile

Donation checkout must work comfortably on mobile.

Campaign CTAs must remain easy to access without intrusive UI.

Do not create desktop-only dashboard assumptions.

---

# 55. Performance

Prioritize:

- Fast initial load
- Optimized campaign imagery
- Avoid excessive client JavaScript
- Prevent unnecessary Supabase calls
- Efficient campaign queries
- Loading skeletons where valuable
- No layout shifts caused by poorly sized imagery

---

# 56. Error Handling

Implement intentional handling for:

- Supabase unavailable
- Campaign missing
- Campaign closed
- Invalid donation amount
- Hyperswitch create-payment failure
- Hyperswitch payment failure
- Payment processing
- Duplicate submission
- Webhook duplication
- Recurring payment failure
- Invalid recurring management token
- Recurring donation already cancelled

Errors should be logged appropriately while giving users human-readable messages.

---

# 57. Payment State Machine

Do not represent payment state using arbitrary booleans such as:

```text
isPaid = true
```

Use explicit states.

MissionPay donation state:

```text
pending
   |
   v
processing
   |
   +----> succeeded
   |
   +----> failed
```

Additional later states:

```text
cancelled
refunded
```

State mapping should be centralized and documented.

---

# 58. Campaign State Machine

```text
draft
  |
  v
published
  |
  v
closed
```

Only published campaigns are publicly discoverable and eligible for donations.

---

# 59. Recurring State Machine

```text
pending
   |
   v
active
   |
   +----> past_due
   |
   +----> cancelled
```

A failed billing attempt should not silently deactivate a recurring donation without an intentional policy.

For MVP:

```text
failure -> past_due
```

Advanced retry/dunning is deferred.

---

# 60. Repository Structure

Recommended:

```text
MissionPay/
|
|-- src/
|   |-- components/
|   |-- features/
|   |   |-- campaigns/
|   |   |-- donations/
|   |   |-- payments/
|   |   |-- recurring/
|   |   |-- fundraiser/
|   |
|   |-- pages/
|   |-- hooks/
|   |-- lib/
|   |   |-- supabase/
|   |   |-- hyperswitch/
|   |
|   |-- types/
|   |-- utils/
|
|-- public/
|   |-- campaigns/
|
|-- supabase/
|   |-- migrations/
|   |-- functions/
|   |   |-- create-payment/
|   |   |-- hyperswitch-webhook/
|   |   |-- process-recurring-donations/
|   |   |-- cancel-recurring-donation/
|   |
|   |-- config.toml
|
|-- docs/
|   |-- PRD.md
|   |-- ARCHITECTURE.md
|   |-- PAYMENT_FLOWS.md
|
|-- .env.example
|-- .gitignore
|-- README.md
```

Adjust only where tooling requires a better structure.

---

# 61. Environment Variables

Use environment variables for public frontend configuration and server secrets.

Examples conceptually:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

HYPERSWITCH_API_KEY=
HYPERSWITCH_BASE_URL=
HYPERSWITCH_PROFILE_ID=
HYPERSWITCH_MERCHANT_ID=
HYPERSWITCH_WEBHOOK_SECRET=
```

Exact Hyperswitch variable requirements must follow the current official sandbox/API documentation.

Never commit populated environment files.

Commit:

```text
.env.example
```

with empty/example values only.

---

# 62. Development Workflow

Codex should work incrementally.

Do not attempt the entire product in one uncontrolled generation.

Recommended implementation order:

## Phase 1: Foundation

- Initialize React/Vite/TypeScript
- Configure Tailwind
- Read `gpt-tasteskill`
- Configure routing
- Configure Supabase
- Create project architecture
- Create migrations
- Create RLS policies

## Phase 2: Campaign product

- Seed fundraiser
- Seed campaigns
- Landing page
- Campaign discovery
- Campaign detail
- Fundraiser authentication
- Campaign management

## Phase 3: One-time payments

- Hyperswitch sandbox configuration
- Create-payment Edge Function
- Checkout
- Payment states
- Webhook
- Database reconciliation
- Success/failure
- Dashboard update

## Phase 4: Monthly recurring

- Recurring database model
- Recurring consent UX
- Hyperswitch CIT/save setup
- Recurring activation
- Scheduled processor
- Hyperswitch MIT
- Recurring dashboard
- Cancellation
- Development test harness

## Phase 5: Product polish

- Responsive QA
- Accessibility
- Loading/error states
- Motion
- Campaign imagery
- Empty states
- Edge cases
- Taste Skill pre-flight

## Phase 6: Deployment

- GitHub
- Supabase production configuration
- Hyperswitch hosted sandbox
- Vercel
- Environment variables
- Webhook URLs
- Final end-to-end testing

---

# 63. Testing Requirements

## Unit/logic

Test:

- Amount validation
- Campaign status validation
- Recurring date calculation
- Billing-period uniqueness
- Payment-status mapping
- Campaign-total calculation
- Anonymous display logic

## Integration

Test:

- Supabase CRUD
- Create payment
- Hyperswitch sandbox
- Webhook updates
- Duplicate webhook event
- Failed payment
- Retried payment
- Monthly setup
- Future MIT execution
- Cancellation preventing future charge

## End-to-end

Required golden paths:

### One-time

```text
Campaign
-> $100 one-time
-> donor details
-> Hyperswitch
-> sandbox payment
-> success
-> Supabase
-> campaign +$100
-> fundraiser dashboard shows transaction
```

### Monthly

```text
Campaign
-> $50 monthly
-> recurring consent
-> donor details
-> Hyperswitch
-> first sandbox payment
-> recurring plan active
-> campaign +$50
-> trigger/scheduler creates next MIT
-> second real sandbox payment
-> campaign +$50 again
-> fundraiser sees both transactions
```

### Failure

```text
Donation
-> failing sandbox payment
-> failed state
-> campaign total unchanged
-> retry available
```

---

# 64. Definition of Done

The MVP is not complete until all of the following are true.

## Product

- Donor can browse campaigns.
- Donor can inspect campaign details.
- Donor can make one-time donation.
- Donor can create monthly recurring donation.
- Fundraiser can authenticate.
- Fundraiser can create and publish campaign.
- Fundraiser dashboard reflects real donations.

## Payments

- Hyperswitch hosted sandbox is genuinely used.
- At least one successful one-time sandbox payment works.
- Initial monthly recurring setup works.
- A subsequent recurring sandbox MIT can be demonstrated.
- Failed payment path works.
- Webhook reconciliation works.
- Duplicate events do not duplicate donations.

## Data

- Supabase stores application data.
- Campaign totals derive from successful donations.
- RLS is active.
- Sensitive payment data is not stored.

## UX

- Desktop works.
- Mobile works.
- Payment states are polished.
- No broken/loading placeholder UI.
- Empty states exist.
- Error states exist.
- Recurring consent is explicit.
- Recurring cancellation works.

## Engineering

- TypeScript has no avoidable errors.
- No secrets committed.
- `.env.example` exists.
- Database migrations are committed.
- Edge Functions are committed.
- README contains setup steps.
- Application is deployed.
- Repository reflects meaningful development history.

---

# 65. Interview Demo Scenario

The prototype should support the following demonstration.

## Scene 1: Fundraiser

Open fundraiser dashboard.

Show:

```text
Clean Water for Rural Communities
$12,450 / $20,000
183 supporters
```

Open campaign.

Explain fundraiser perspective.

## Scene 2: Donor

Open public campaign page.

Choose:

```text
$100
One-time
```

Complete real Hyperswitch sandbox payment.

Show successful MissionPay confirmation.

Return to campaign.

Show:

```text
$12,550 raised
```

Open fundraiser dashboard.

Show new $100 donation.

## Scene 3: Monthly donor

Return as donor.

Choose:

```text
$50
Monthly
```

Show explicit monthly consent.

Complete first Hyperswitch sandbox transaction.

Show:

```text
Monthly donation active
Next donation: [date]
```

Open fundraiser dashboard.

Show recurring supporter.

## Scene 4: Recurring payment infrastructure

Use protected sandbox/development billing trigger.

Execute the next recurring donation.

Show:

```text
Hyperswitch MIT
-> successful
-> new MissionPay donation
-> campaign total increases
-> fundraiser activity updates
```

This is the strongest demonstration of MissionPay's payment architecture.

---

# 66. Architecture Story for Juspay

The implementation should make the following explanation true:

> MissionPay separates fundraising business state from payment orchestration. Supabase owns campaigns, donors, donations, recurring schedules, and fundraiser experiences. Hyperswitch owns payment orchestration. The frontend never receives privileged payment credentials. Payment creation occurs server-side through Supabase Edge Functions, while Hyperswitch's checkout handles payment collection. Payment outcomes reconcile back into MissionPay through verified, idempotent backend processing. Monthly giving begins with an authorized customer-initiated payment and then uses scheduled merchant-initiated payments for future monthly contributions.

This is a primary architectural objective of the prototype.

---

# 67. Product Scope Rationale

The MVP deliberately demonstrates two stakeholders without trying to reproduce an entire fundraising marketplace infrastructure.

MissionPay builds:

```text
Fundraiser campaign ownership
Donor experience
One-time payment
Monthly recurring payment
Payment lifecycle
Campaign progress
Fundraiser analytics
```

MissionPay defers:

```text
Fundraiser financial onboarding
KYB
Independent Hyperswitch merchant creation
Bank payouts
Settlement routing
Marketplace compliance
```

This keeps the prototype focused on the highest-value donor payment and fundraiser visibility flows while leaving a clear architecture path toward a full multi-merchant fundraising platform.

---

# 68. Required Documentation Generated During Build

Keep documentation updated as implementation proceeds.

Required:

```text
docs/PRD.md
docs/ARCHITECTURE.md
docs/PAYMENT_FLOWS.md
README.md
```

## `ARCHITECTURE.md`

Document:

- Frontend architecture
- Supabase architecture
- Database relationships
- RLS strategy
- Hyperswitch integration
- Webhook architecture
- Recurring architecture
- Deployment

## `PAYMENT_FLOWS.md`

Document:

- One-time payment
- Monthly CIT/setup
- Monthly MIT
- Payment status transitions
- Failure flow
- Cancellation
- Deferred refund/dispute behavior

---

# 69. Important Codex Instructions

Before implementation:

1. Read this entire PRD.
2. Read the installed `gpt-tasteskill`.
3. Review the current official Hyperswitch documentation.
4. Inspect existing repository contents before changing anything.
5. Produce an implementation plan.
6. Identify assumptions.
7. Do not silently substitute another payment provider.
8. Do not mock Hyperswitch for the final integration.
9. Do not bypass Supabase.
10. Do not expose payment secrets.
11. Do not remove monthly recurring donations.
12. Do not hard-code successful payment states.
13. Do not hard-code dashboard totals for the primary demo flow.
14. Do not mark a task complete if it has not been tested.
15. Preserve clear commits/checkpoints during development.

If official Hyperswitch APIs differ from assumptions made in this PRD, use the current official Hyperswitch API and document the implementation difference.

Do not change product behavior merely because a shortcut is easier to code.

---

# 70. Final Product Standard

MissionPay should not feel like:

```text
A React frontend with a payment form added to it.
```

It should feel like:

```text
A real donations product whose payment architecture happens to be powered by Hyperswitch.
```

A successful build demonstrates:

**Product thinking**

The donation experience matches the needs of fundraising.

**Payment thinking**

One-time, recurring, success, failure, payment state, consent, and server-side authority are deliberately designed.

**Technical thinking**

React, Supabase, Hyperswitch, webhooks, scheduling, security, and data ownership fit together coherently.

**Design thinking**

The product feels trustworthy, human, polished, responsive, and production-ready.

**Scope thinking**

The prototype goes deep on the essential donor and fundraiser experience while explicitly deferring marketplace settlement complexity.

---

# 71. MissionPay MVP North Star

The core demonstration is:

```text
Fundraiser creates campaign
        |
        v
Donor discovers campaign
        |
        v
Donor chooses one-time OR monthly
        |
        v
Real Hyperswitch sandbox payment
        |
        v
MissionPay reconciles payment
        |
        v
Supabase records donation
        |
        v
Campaign progress updates
        |
        v
Fundraiser sees result
```

For monthly:

```text
Initial authorized donation
        |
        v
Recurring plan becomes active
        |
        v
MissionPay reaches next billing date
        |
        v
Hyperswitch MIT
        |
        v
New successful donation
        |
        v
Campaign and fundraiser update again
```

**That complete lifecycle is MissionPay.**

---

# 72. Required External References

```text
Hyperswitch Documentation
https://docs.hyperswitch.io/

Hyperswitch GitHub
https://github.com/juspay/hyperswitch

Hyperswitch API Reference
https://api-reference.hyperswitch.io/introduction

Taste Skill
https://www.tasteskill.dev/
```

When payment implementation details are uncertain, official Hyperswitch documentation is authoritative.

When frontend implementation/design decisions are being made, read the installed `gpt-tasteskill` before generating UI.

---

# 73. Final MVP Priority Order

If implementation time becomes constrained, prioritize in exactly this order:

1. Secure Hyperswitch integration
2. Successful one-time donation
3. Monthly recurring donation setup
4. Subsequent recurring MIT execution
5. Correct Supabase persistence
6. Webhook/payment reconciliation
7. Campaign progress updates
8. Fundraiser dashboard visibility
9. Donor failure and retry
10. Recurring cancellation
11. Mobile/responsive quality
12. Visual polish
13. Secondary campaign functionality
14. Deferred features

**Do not sacrifice payment correctness to add more surface-area features.**

The product should be small enough to understand completely and polished enough to feel real.
