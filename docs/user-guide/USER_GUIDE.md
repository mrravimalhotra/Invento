# Invento User Guide

**A complete guide to using Invento — Atharva's inventory, quality control, and manufacturing system.**

*Version: September 2026 · This guide is updated whenever the app changes in a way that affects how you use it. See "How this guide stays current" at the end.*

---

## Table of contents

1. [Welcome to Invento](#welcome-to-invento)
2. [Getting started](#getting-started)
3. [The big picture: how data flows through Invento](#the-big-picture-how-data-flows-through-invento)
4. [What your role lets you do](#what-your-role-lets-you-do)
5. [Overview](#overview)
   - [Dashboard](#dashboard)
6. [Master data](#master-data)
   - [Item Type Master](#item-type-master)
   - [Item Master](#item-master)
   - [Vendor Master](#vendor-master)
   - [Instrument / Equipment Master](#instrument--equipment-master)
   - [Dead Stock Register](#dead-stock-register)
7. [Procurement](#procurement)
   - [Purchase](#purchase)
   - [Inventory Ledger](#inventory-ledger)
8. [Quality Control & Documents](#quality-control--documents)
   - [Quality Control](#quality-control)
   - [Label Printing](#label-printing)
   - [Certificate of Analysis](#certificate-of-analysis)
   - [SOP / STP Documents](#sop--stp-documents)
   - [Audit Log](#audit-log)
9. [Manufacturing](#manufacturing)
   - [MFR](#mfr)
   - [Finished Product](#finished-product)
   - [Packaging](#packaging)
10. [Admin](#admin)
    - [User Roles & Access](#user-roles--access)
    - [Reports](#reports)
    - [Tester Feedback](#tester-feedback)
    - [Bulk Data Upload](#bulk-data-upload)
    - [Opening Stock](#opening-stock)
    - [Company Details](#company-details)
    - [Purge Test Data](#purge-test-data)
    - [Legacy / deprecated modules](#legacy--deprecated-modules)
11. [Glossary](#glossary)
12. [FAQ & troubleshooting](#faq--troubleshooting)
13. [How this guide stays current](#how-this-guide-stays-current)

---

## Welcome to Invento

Invento is Atharva's system of record for everything between "a vendor delivers raw material" and "a finished, labeled, certified product is ready to ship." It replaces paper registers and spreadsheets with one connected system: every raw material batch, every quality check, every recipe, every production run, and every certificate is entered once and then reused everywhere it's needed.

This guide is written for everyone who uses Invento day to day — whether you're recording a delivery, running a quality check, building a batch, or just looking something up. You don't need to read it cover to cover. Use the table of contents to jump to the screen you're working on, or read [The big picture](#the-big-picture-how-data-flows-through-invento) first if you want to understand how everything connects before diving into a specific module.

Each module section below follows the same pattern, so you always know where to look for a given kind of answer:

- **Where to find it** — the exact menu path in the sidebar.
- **Who can use it** — who can view the screen, and who can add, edit, or delete on it.
- **What it's for** — the plain-language purpose of the screen.
- **How to…** — step-by-step instructions for the main things you'll do there.
- **Fields you'll be asked for** — what each important field means and any rules around it.
- **How it connects to the rest of the app** — what feeds into this screen and what it feeds into.
- **Good to know** — practical tips, edge cases, and things that trip people up.

---

## Getting started

### Signing in

Go to Invento's sign-in page and enter your email and password. If you don't have an account yet, use the **Register** link on the sign-in page to create one — your access to specific screens and actions still depends on which roles a System Admin assigns you afterward (see [What your role lets you do](#what-your-role-lets-you-do)), so a new account can typically view the app immediately but won't see "Add/Edit" buttons until roles are assigned.

Forgot your password? Use the **Forgot password** link on the sign-in page to receive a reset link by email, then set a new password on the page it takes you to.

### Finding your way around

Once you're signed in, you'll always see the same layout:

- **Sidebar (left)** — every module you have access to, grouped the same way this guide is organized: Overview, Master data, Procurement, Quality Control & Documents, Manufacturing, and Admin.
- **Top bar (right)** — your name and assigned role(s), a live **low stock** alert badge when any item has fallen below its reorder threshold (click it to jump straight to Item Master), a **Profile** link, and **Sign out**.
- **Main area** — the screen you're currently on.

At the bottom of every single page you'll find a **Feedback & change log** box — this is the fastest way to report something confusing or broken from exactly where you noticed it. See [Tester Feedback](#tester-feedback) for details.

### Your profile

Click **Profile** in the top bar at any time to see your account details (email, assigned roles), update your display name, or change your password. This is entirely self-service — you don't need a System Admin to change your own name or password.

### First-time orientation

If you're brand new to Invento, the fastest way to get oriented is:

1. Open the **Dashboard** (it's the first thing you see after signing in) to get a sense of what's currently in the system — how much stock, how many pending quality checks, recent production.
2. Read [The big picture](#the-big-picture-how-data-flows-through-invento) below to understand how a batch of raw material moves through the app from delivery to finished product.
3. Check [What your role lets you do](#what-your-role-lets-you-do) to see which specific screens and actions apply to your job.
4. Jump to the module section for whatever you're about to do.

---

## The big picture: how data flows through Invento

Invento models one continuous chain, and understanding this chain is the single most useful thing you can know about the app — almost every "why can't I do X" question traces back to where you are in this sequence.

**1. Purchase — material arrives.**
A purchase order is created for a vendor delivery, with one line per item received. While it's a Draft, nothing about it affects stock, and you can freely edit or delete lines. Clicking **Final Submit** is the moment that matters: it locks the order and pushes the received quantity (minus whatever was set aside for QC/Stability/R&D sampling) into inventory as a new batch.

**2. Quality Control — material is cleared for use.**
Every batch that comes in through Purchase must pass Quality Control before it can be used for anything. This is a deliberate **two-round check**: a Quality Checker reviews it first, and — only if they approve — a *different* person, the QC Reviewer, does a second and final review. A batch that's rejected at either round, still pending, or overdue for a scheduled retest is **blocked from use everywhere else in the app** — this isn't just a display convention, the system itself won't let you pick a non-approved batch when building something downstream.

**3. Inventory Ledger — stock is tracked.**
Every movement — material received, samples pulled for QC, material consumed in production, packaging issued, wastage recorded — flows automatically into one ledger. This is where you check what's actually on hand right now, or what was on hand as of a past date.

**4. MFR — the recipe is defined and approved.**
A Manufacturing Formula Record (MFR) is the approved recipe for a finished product: which raw materials, in what quantities, make one batch. An MFR itself has to be approved before it can be used to build product, and approving a new MFR is also what creates the corresponding Finished Product item in Item Master — you don't create finished-product items by hand.

**5. Finished Product — the batch is built.**
Using an approved MFR, a finished product batch is composed by drawing down QC-approved raw material stock (the system suggests batches to use on a first-in-first-out basis, oldest approved stock first). The finished batch then goes through its own QC round before it's considered complete.

**6. Packaging — the batch is issued.**
Finished product and packaging materials are issued out — either to Store/R&D or into Production — tracking what left the warehouse and for what purpose.

**7. Certificate of Analysis & Label Printing — the paperwork is produced.**
Once a batch (raw material or finished product) has cleared QC, a Certificate of Analysis can be generated against a pre-defined set of tests and specifications for that item type, and shop-floor labels (Approved Raw Material, Under Test, In-process, Finished Product) can be printed straight from the same underlying batch and QC data. Neither of these screens changes any data — they only format what's already been recorded.

Two things run alongside this whole chain rather than as steps in it: **Reports and the Dashboard** give you rolled-up, live views of everything above without you having to visit each module, and the **Audit Log** keeps a permanent, tamper-evident history of who approved, submitted, or changed the handful of records where that matters most (QC decisions, Finished Product status, Purchase Order submission, MFR approvals).

---

## What your role lets you do

Everyone signed in to Invento can **view** virtually everything — there's no need for special access just to look something up. What your assigned role(s) control is what you can **add, edit, delete, or approve**. You can hold more than one role at once, and a System Admin manages this for everyone on the [User Roles & Access](#user-roles--access) screen.

- **Inventory Manager** — creates and submits purchase orders, manages Item Master/Vendor Master, records wastage in the Inventory Ledger, and contributes to Finished Product and Packaging.
- **System Admin** — the broadest role. Can do essentially everything every other role can do, plus admin-only actions no one else has: managing user roles, deleting master-data records, reopening a submitted purchase order, and running Purge Test Data. If you're ever blocked from something and don't know why, a System Admin is usually who to ask.
- **Super Auditor** — a read-focused role with one specific extra: access to the Audit Log (alongside System Admin).
- **Quality Checker** — performs Round 1 of the two-round QC review, and can act on Certificates of Analysis, SOP/STP Documents, Equipment, and Dead Stock.
- **QC Reviewer** — performs Round 2 (the final decision) of the two-round QC review, plus the same COA/Documents/Equipment/Dead Stock access as Quality Checker. The same person can never do both QC rounds on the same batch.
- **MFR Manager** — creates and approves MFRs (recipes), builds Finished Product batches, and contributes to Item Master, Packaging, and Equipment.

A handful of things are open to **any** signed-in user regardless of role, because they're either informational or self-service: viewing every module, submitting Tester Feedback, printing labels, generating reports, and managing your own Profile.

---

## Overview

### Dashboard

**Where to find it:** Overview → Dashboard

**Who can use it:** Every signed-in user. This is the home page — there's nothing here that requires a particular role to view.

**What it's for:** The Dashboard is your landing page when you open Invento. It gives you an at-a-glance summary of the whole business — how much stock you have, how many purchase orders and QC checks are in flight, and how production is trending — pulled live from the same data every other screen uses, so it's always current.

**How to check what needs your attention today**
1. Open Invento — you land on the Dashboard automatically.
2. Scan the row of summary cards across the top (Raw materials, Vendors, MFR definitions, Finished batches, POs in the last 30 days, Pending QC). Click any card to jump straight to that module.
3. If anything needs action, you'll see one or both warning cards just below: **Low stock** (raw materials whose on-hand quantity has dropped below their reorder threshold) and **Retest due soon** (QC items with a retest date coming up in the next 30 days). These only appear when there's something to flag.
4. Click any item in those warning lists to go straight to the relevant screen (Item Master or Quality Control).
5. Scroll down to see four charts: inventory movement in and out over the last 30 days, QC results by status, purchase value over the last 30 days, and finished batches produced over the last 30 days.

**How it connects to the rest of the app**
Nothing is entered here — every number and chart is a live read of records created in Item Master, Vendors, Purchase, QC, MFR, and Finished Product. There's no separate reporting step; as soon as something changes elsewhere in the app, the Dashboard reflects it on your next visit.

**Good to know**
- The "Hide legacy data" checkbox in the top-right corner is a personal display preference, not a delete — it hides old/legacy (LEG-) records from lists and dropdowns throughout the app, on your browser only, and can be switched back on any time.
- The low-stock and retest warnings only show up when there's actually something to flag — an empty dashboard below the summary cards is a good sign, not a bug.
- The "Pending QC" count includes items waiting at either QC step (initial check or the second-round review), so it may look higher than just "not yet checked at all."

---

## Master data

Master data is the foundation everything else builds on: your catalog of items, vendors, equipment, and item categories. Set these up first — or check they're already there — before trying to record a purchase, run QC, or build a recipe.

### Item Type Master

**Where to find it:** Master data → Item Type Master

**Who can use it:** Everyone can view it. Only System Admin, Inventory Manager, or MFR Manager can add or edit item types. Deleting an item type is System Admin only.

**What it's for:** Item types are the categories you tag items with in Item Master (for example "Herb Powder" or "Bottle Cap"). This screen is just a simple, flat list of those category descriptions — you add them here first, then pick from them when creating an item.

**How to add a new item type**
1. Go to Item Type Master. If you have write access, you'll see an "Add new item type" box directly above the list.
2. Type a description (this is the only field) and save.
3. The new item type appears in the list immediately, marked Active, and is now available to pick from when creating or editing items.

**How to edit or deactivate an item type**
1. Click the item type's name in the list to open it.
2. Change the description, or untick the Active checkbox to retire it without deleting it (an inactive item type stays in the list with an Inactive badge, but won't show up as a choice on new items).
3. Save.
4. System Admins also see a Delete button here, which asks for confirmation before permanently removing the item type.

**Fields you'll be asked for**
- **Description** — the category name itself; it must be unique, so you'll get an error if you try to add one that already exists.
- **Active** — only appears on the edit screen; unticking it hides the item type from pickers elsewhere without deleting its history.

**How it connects to the rest of the app**
Every item in Item Master can be tagged with one item type, and several bulk-upload templates (Item Master, MFR) let you reference an item type by its exact description. The list shows both active and inactive item types together, since the whole point of this screen is to manage that toggle.

**Good to know**
- You can't delete an item type that's still in use on any item — you'll be told to reassign or remove those items first, or just deactivate the item type instead.
- Adding a description that already exists (even with different capitalization is fine, but an exact duplicate isn't) will be rejected with a clear message rather than creating a duplicate.

### Item Master

**Where to find it:** Master data → Item Master

**Who can use it:** Everyone can view it. Only System Admin, Inventory Manager, or MFR Manager can add or edit items. Deleting an item is System Admin only.

**What it's for:** This is the master list of every raw material and packaging item Atharva stocks — names, codes, units, barcodes, and current stock levels. It's the foundation that Purchase, Inventory Ledger, QC, and Manufacturing all build on. Finished Product items are not created here — those come automatically from the MFR screen instead.

**How to add a new item**
1. Go to Item Master and click "New item."
2. Choose a Category: Raw material or Packaging (Finished Product items can't be created from here — they're generated automatically when someone sets up an MFR recipe).
3. Fill in the Name and any other fields that apply, then save.
4. You'll land on the item's detail page with its item code already assigned, and a one-time "successfully added" banner confirms it.

**How to edit an item**
1. From the list, click the item's code or name to open its detail page.
2. Update any field except the item code (which is permanent once assigned) and, for Finished Product items, the category (which is locked).
3. Save. Changes take effect immediately; there's no approval step.
4. System Admins also see a Delete button here, which asks for confirmation before permanently removing the item.

**Fields you'll be asked for**
- **Item code** — shown as a read-only preview while creating (e.g. "RM-006" for a raw material; after RM-999 it carries on as RM-1000); the real code is only assigned once you save, and it never changes afterward.
- **Botanical Name** — an optional alternate/scientific name for the raw material.
- **Category** — Raw material or Packaging only when creating; existing Finished Product items show Category locked and read-only.
- **Item type** — optional dropdown pulled from Item Type Master's active entries.
- **Barcode** — optional, free text, but must be unique across all items; if filled in, the item's detail page shows it as a scannable barcode image.
- **Low stock threshold** — optional number; when stock on hand falls below it, the item is flagged with a "Low stock" badge.

**How it connects to the rest of the app**
Items you create here are what Purchase, QC, Inventory Ledger, MFR, and Packaging all reference — a purchase line, a QC sample, or an MFR ingredient is always tied back to an item on this list. Stock on hand shown here is calculated automatically from all the purchase, usage, and wastage activity recorded elsewhere in the app; you never enter it directly.

**Good to know**
- The list is sorted with the newest items first, so anything you just added should be right at the top rather than buried behind older or legacy rows.
- QC/Stability/R&D sample quantities used to be set here as defaults — that's no longer done on this screen; those quantities are now entered directly on the Purchase screen when a batch actually arrives.
- You can't delete an item that already has any purchase, QC, inventory, production, or MFR history — deactivate it instead using the Active checkbox.
- Both active and inactive items show in the list, so you can always find and reactivate something you'd previously turned off.

### Vendor Master

**Where to find it:** Master data → Vendor Master

**Who can use it:** Everyone can view it. Only System Admin or Inventory Manager can add or edit vendors. Deleting a vendor is System Admin only.

**What it's for:** This is the master list of suppliers you purchase raw materials and packaging from — their contact details and vendor code. It's what you pick from when creating a purchase order.

**How to add a new vendor**
1. Go to Vendor Master. If you have write access, an "Add new vendor" panel sits right next to the list, showing you the vendor code it's about to assign (e.g. "V-0093").
2. Fill in the Name (required) and any contact details you have — address, mobile, phone, email.
3. Save. You stay on the same page, the new vendor appears in the list, and a one-time success message confirms it — this way you can add several vendors back-to-back without extra clicks.

**How to edit a vendor**
1. Click the vendor's name or code in the list to open its detail page.
2. Update any field and save — the change is confirmed inline on the same page.
3. System Admins also see a Delete button here, which asks for confirmation before permanently removing the vendor.

**Fields you'll be asked for**
- **Vendor code** — auto-assigned; shown as a preview while adding, and as the real, permanent code once saved.
- **Email** — optional, but must look like a valid email address if you enter one.

**How it connects to the rest of the app**
Every purchase order is tied to a vendor from this list, so a vendor has to exist here before you can record a purchase from them.

**Good to know**
- There's no way to deactivate a vendor (unlike items or equipment) — the list simply shows all vendors on file.
- You can't delete a vendor that already has a purchase order on file — you'll need to reassign or remove those first.
- The vendor code shown while you're filling out the Add form is a preview, not a reservation — if two people are adding a vendor at the same moment, the code you actually get on save is guaranteed correct even if the preview briefly looked out of date.

### Instrument / Equipment Master

**Where to find it:** Master data → Instrument / Equipment Master

**Who can use it:** Everyone can view it. System Admin, Inventory Manager, MFR Manager, Quality Checker, and QC Reviewer can all add or edit equipment records (this list is wider than most master-data screens because equipment and calibration status matter to both production and QC). Deleting a record is System Admin only.

**What it's for:** This is the register of instruments and equipment used across Atharva's rooms — what it is, where it lives, its asset tag, and whether it's currently calibrated. It's a reference list, not something that drives stock or production calculations.

**How to add equipment**
1. Go to Instrument / Equipment Master. If you have write access, an "Add" form sits above the list.
2. Fill in the Name at minimum; add Room No., Section, Asset ID, Quantity, and calibration details if known.
3. Save — the new row appears in the list, sorted by Room and then by its auto-assigned equipment code.

**How to edit equipment**
1. Click a row in the list to open its detail page.
2. Update any field — including calibration status and dates as they change — and save.
3. System Admins also see a Delete button here, which asks for confirmation before permanently removing the record.

**Fields you'll be asked for**
- **Equipment code** — auto-assigned (e.g. "EQ-0001"), shown as a preview while adding.
- **Asset ID** — the physical printed/engraved tag on the instrument, if it has one. This is the field that must be unique, not the Name — it's completely normal to have several rows all named "Wooden Barrels," each with its own distinct Asset ID.
- **Calibration status** — Calibrated / Due / Not Applicable; leave blank if it doesn't apply yet.
- **Last calibration date / Next calibration due** — plain dates to track when the instrument was last checked and when it's due again.

**How it connects to the rest of the app**
This is a standalone reference list — nothing else in the app currently reads from it automatically (for example, there's no dashboard alert yet for equipment coming due for calibration, the way there is for low stock).

**Good to know**
- Names repeat on purpose — don't worry about seeing the same equipment name multiple times, as long as each row's Asset ID (if it has one) is distinct.
- There's currently no automatic reminder when calibration is coming due — you need to check this screen yourself.

### Dead Stock Register

**Where to find it:** Master data → Dead Stock Register

**Who can use it:** Everyone can view it. System Admin, Inventory Manager, MFR Manager, Quality Checker, and QC Reviewer can all add or edit records. Deleting a record is System Admin only.

**What it's for:** This tracks assets that are written off or no longer in active use — what they cost, how much they've depreciated, and what's left of their value. It's reviewed and adjusted by hand a few times a year, not a live transaction feed.

**How to add a dead stock record**
1. Go to Dead Stock Register. If you have write access, an "Add" form sits above the list, showing you the asset code it's about to assign.
2. Fill in the Name of the article and whatever purchase/depreciation details you have.
3. Save — the row appears in the list, sorted by asset code.

**How to update a record (e.g. after a write-off)**
1. Click the row in the list to open its detail page.
2. Update Balance qty and Balance value by hand to reflect the current state — these are not calculated automatically, so you need to adjust them yourself when something changes.
3. Fill in Resolution date, Rejected qty, and Rejected value if the entry is being written off, and save.

**Fields you'll be asked for**
- **Purchase price** — this is the price per unit, not the total for the whole quantity.
- **Depreciation %** — defaults to 25% if left blank when bulk-uploading; on this screen it's a plain number you enter.
- **Depreciated value / unit** — calculated automatically for you from Purchase price and Depreciation % (purchase price × (100 − depreciation %)) — you don't enter this.
- **Balance qty / Balance value** — entered and updated by hand; the app does not keep a running ledger of these for you.
- **Rejected qty / Rejected value** — record how much was written off and its value, when that happens; this is also a manual entry, not a formula.

**How it connects to the rest of the app**
This register is independent of Inventory Ledger — it doesn't pull from or push to stock-on-hand calculations elsewhere in the app. It's a standalone asset-tracking record.

**Good to know**
- Balance qty and Balance value don't update themselves when you record a rejection — you need to adjust them yourself to reflect the new balance.
- There's no formal review/approval workflow for write-offs here (unlike, say, Batch Manufacturing Records) — it's a straightforward editable register.

---

## Procurement

### Purchase

**Where to find it:** Procurement → Purchase

**Who can use it:** Everyone signed in can view purchase orders. Only a System Admin or Inventory Manager can create a purchase order, add/edit/delete its lines, or submit it. Once an order has been submitted, only a System Admin can reopen it.

**What it's for:** This is where goods received from a vendor get recorded — one purchase order per vendor invoice, with one line per item received. A purchase order starts as an editable Draft and stays that way until someone clicks Final Submit, which is the moment its stock actually becomes part of inventory. Nothing you add to a Draft order affects stock levels until it's submitted.

**How to create a purchase order and add items**
1. Go to Procurement → Purchase and start a new purchase order. Enter the vendor, invoice number, and invoice date — the order's own number is assigned automatically.
2. On the same screen, use the "Add line" form to add each item received: pick the item, and its batch number is generated for you automatically. Enter the quantity received and confirm the unit (it defaults from the item).
3. Enter the QC, Stability, and R&D sample quantities and the sample unit for that line — these are set aside for testing and will not count as usable stock. These four fields are mandatory: if an item genuinely needs no sample, enter **0**, not blank — the form pre-fills 0 for you when you pick the item, so in normal use you rarely have to type it yourself.
4. Enter unit price, GST %, and expiry date, then save the line. Repeat for each item on the invoice, or use bulk upload for many lines at once. While the order is still a Draft, you can edit or delete any line.

**How to submit a purchase order so stock becomes available**
1. Once every line on the order is correct, click **Final Submit** on the order's detail page. This is a whole-order action — you can't submit just one line at a time.
2. Submitting pushes each line's remaining quantity (received quantity minus its QC/Stability/R&D samples) into inventory in one go, and locks the order so its lines can no longer be edited or deleted.
3. If something was submitted by mistake, a System Admin can click **Reopen**, which reverses the stock that was pushed and unlocks the order for editing. Resubmitting later re-pushes whatever the (possibly corrected) lines say at that point.

**Fields you'll be asked for**
- **QC Qty / Stability Qty / R&D Qty** — how much of the received quantity is being set aside for each kind of testing. Required on every raw-material line; enter 0 if none is needed for that line.
- **Batch number** — generated automatically the moment you pick the item; you never type this yourself.
- **Remaining quantity** — shown on the line once saved; it's simply quantity received minus the three sample quantities, calculated automatically.
- **Raw Material / Packaging Item** — choose which kind of line you're adding. Packaging lines skip the QC/Stability/R&D sample fields entirely, since packaging is never sampled.

**How it connects to the rest of the app**
Nothing on a Draft order is visible anywhere else in the app — Quality Control's "new batch" picker, the wastage form's batch picker, and the RM stock report all only show batches from **submitted** purchase orders. Submitting a purchase order is also what creates the batch that then needs to go through Quality Control before it can be used in manufacturing.

**Good to know**
- The QC/Stability/R&D quantities and unit are mandatory fields — you cannot leave them blank, but 0 is always an acceptable answer for a line that needs no sample.
- Reopening a submitted order is a bigger action than submitting it (it reverses real stock), which is why only a System Admin can do it, and the screen asks for a two-step confirmation.
- You can't change the item, batch number, or unit on a line after it's saved — only quantity, prices, dates, and sample amounts. If you picked the wrong item, delete the line and re-add it (only possible while the order is still a Draft).

### Inventory Ledger

**Where to find it:** Procurement → Inventory Ledger

**Who can use it:** Everyone signed in can view all three tabs (Ledger, Stock Position, RM Report As On Date). Recording wastage is limited to System Admin, Inventory Manager, Quality Checker, or QC Reviewer.

**What it's for:** This is the record of every stock movement in Invento — material coming in from Purchase, samples pulled out for QC, material consumed making finished product, packaging issued, and wastage — plus two ways to see where things stand: a current on-hand view (Stock Position) and a report of stock as of any past date (RM Report As On Date). Everything on these screens is generated automatically from other modules except wastage, which is the one thing you record here directly.

**How to check current stock on hand**
1. Go to Procurement → Inventory Ledger and open the **Stock Position** tab.
2. Each item shows its current on-hand quantity, with a red "Low stock" badge if it's fallen below that item's threshold, and a short breakdown line (e.g. Received / QC / Stability / R&D / FP use / Wastage) showing where the quantity came from or went.
3. Click an item's name to open its detail page — the full breakdown, its list of batches, and a ledger of just that item's movements.

**How to record wastage**
1. From any tab in Inventory Ledger, click **Record wastage**.
2. Choose the item, then the specific batch it's coming from (the dropdown shows each batch's remaining quantity) — a batch is required, you can't record wastage against an item with no batch specified.
3. Enter the quantity, confirm the unit, and enter a reason (required — a short explanation of what happened). Submit; the quantity is deducted from that batch's available stock immediately.

**Fields you'll be asked for**
- **Batch** — required. Picking a batch (not just an item) is what ties the wastage to a specific received lot.
- **Reason** — a short required note on why the material was wasted (spillage, damage, expiry, etc.).
- **Running balance** (Ledger tab column) — the item's stock level after that specific row's movement, so you can see the balance change line by line.

**How it connects to the rest of the app**
This module is downstream of everything else: a Purchase Final Submit creates the "push" rows here, starting a QC check creates the sample "pull" rows automatically, and Finished Product/Packaging create their own rows when batches are made or issued. Wastage is the only entry you create directly on this screen. The RM Report As On Date and the Ledger/Stock Position views only ever reflect batches from **submitted** purchase orders — a Draft order's stock won't appear here at all.

**Good to know**
- The main Ledger tab shows only the 1,000 most recent events — use the item, reason, and date filters if you're looking for something older rather than scrolling.
- The RM Report As On Date is a snapshot for a specific date you pick (it defaults to today), not a live view — use it when you need to know what stock looked like at a past point in time, and use the Export PDF button to save or print it.
- Wastage always needs a batch now — if an item has no received batches yet, the form won't let you submit until one exists.

---

## Quality Control & Documents

### Quality Control

**Where to find it:** Quality Control & Documents → Quality Control

**Who can use it:** Everyone signed in can view Assign Records (ARs). Starting a new AR (assigning a batch for QC) can be done by a System Admin, Inventory Manager, Quality Checker, or QC Reviewer. The first review round can only be done by a Quality Checker (or System Admin); the second and final review round can only be done by a QC Reviewer (or System Admin). The same person cannot perform both rounds on the same batch (System Admin is the only exception).

**What it's for:** This is the single most important checkpoint in Invento: raw material that hasn't cleared Quality Control cannot be used to make anything. Every batch received through Purchase must be assigned a QC check, then pass **two separate rounds of review** by two different people before its stock is allowed into production. A batch that's rejected, still awaiting review, or overdue for a scheduled retest is blocked from use — the app enforces this, not just the screen.

**How to start QC on a newly received batch**
1. Go to Quality Control & Documents → Quality Control. Batches that just came in and haven't been assigned for QC yet show in the green **"Awaiting QC"** card at the top of the page.
2. Click **Start QC** on a row (or use **New AR** and pick the item, then the batch, yourself). The sample quantity, sample unit, and expiry date are pre-filled from what was set on the purchase line — check them and adjust if needed.
3. Submit. This gives the batch an Assign Record (AR) with an AR number, and its status becomes "Submitted" — ready for the first review round.

**How to review and approve or reject a batch**
1. **Round 1 (Quality Checker):** Open the AR. With the batch still "Submitted," you'll see the Round 1 form — choose **Approved** or **Rejected**, add comments, and submit.
   - If **Rejected**, the batch is done — it's rejected, final, and no second round happens.
   - If **Approved**, the status changes to **"Approved – Awaiting Review"** and the AR moves into the QC Reviewer's queue for Round 2. Round 1's decision now shows read-only at the top of the page from here on.
2. **Round 2 (QC Reviewer):** Open the same AR. Choose **Approved** or **Rejected**, add comments, and if approving, you must also enter a **Retest Period (days)** — how many days until this batch needs to be sampled and tested again. Submit.
3. Once Round 2 is decided, the record is final — both rounds' decisions are shown read-only and nothing more can change. Only a batch that clears **both** rounds as Approved has its stock made available for making finished product.

**Fields you'll be asked for**
- **Sample Quantity / Unit** — pre-filled from what was reserved on the purchase line; usually you just confirm it.
- **Retest Period (days)** — Round 2 only, and only when approving. This is entered by hand, not calculated automatically, because how long a material stays good before needing a re-check genuinely varies by material and by what the test found. The retest date itself is then worked out automatically from this.
- **Comments** — a short note explaining the decision, at both rounds.

**How it connects to the rest of the app**
Only a batch that is fully Approved (both rounds, and not currently overdue for a retest) can be selected when composing a Finished Product batch or a Batch Manufacturing Record — every other status blocks it, even if someone tries to force it. When a batch's retest date arrives, it shows up on this page under a **"Due for retest"** card; clicking **Start Retest** reuses the stability sample already reserved back at Purchase time and sends the batch through the same two-round review again.

**Good to know**
- Assigning QC ("New AR") is open to a wider group of roles than actually deciding the outcome — the two review rounds are deliberately restricted to the Quality Checker and QC Reviewer roles (System Admin can stand in for either).
- The same person can't approve both rounds on the same batch. If you did Round 1, you won't be able to do Round 2 on that same AR.
- A batch sitting at "Approved – Awaiting Review" is not yet usable — it needs the second round too. Don't assume a batch is clear until it shows a final "Approved" status.
- A retest AR is marked with a small "Retest" badge so you can tell it apart from a batch's first-ever QC check.

### Label Printing

**Where to find it:** Quality Control & Documents → Label Printing

**Who can use it:** Any signed-in user. There's no separate permission for this screen — printing a label doesn't save or change anything in the system, it just formats existing data onto a page.

**What it's for:** Prints the standard shop-floor labels — Approved Raw Material, Under Test, In-process, and Finished Product — using data already recorded in Purchase, Quality Control, and Finished Product. The output is a pixel-matched copy of the actual paper templates used on the floor, ready to print and cut apart.

**How to print labels**
1. Go to Label Printing.
2. Pick the **Label type**: Approved Raw Material, Under Test, In-process, or Finished Product.
3. Pick the **Record** — for the three Raw Material label types, search for the purchase batch by batch number or item name; for Finished Product, search for the finished batch.
4. Check the on-screen preview — it shows the exact label layout with your batch's details filled in.
5. Click **Download PDF**. You get a print-ready sheet with several copies of the same label — 6 per page (2×3) for Approved Raw Material, Finished Product, and In-process, or 10 per page for Under Test.
6. Print, cut the labels apart, and apply them.

**Fields you'll be asked for**
- **Label type** — determines the layout, wording, and which fields appear.
- **Record** — the purchase batch (raw material labels) or finished product batch (Finished Product label) the label's details are pulled from.

A few fields have no source data anywhere in the system yet, so they print as a blank line for someone to fill in by hand: **Retest Period** (when not set on the QC record), **In-process Start Date**, and the **Sign** line on every label.

**How it connects to the rest of the app**
This screen only reads information already entered elsewhere — Purchase for batch/vendor/invoice details, Quality Control for approval status and retest period, and Finished Product for batch and expiry details. Nothing you do here changes any of that data.

**Good to know**
- The batch picker isn't limited to only approved batches — check the QC status shown next to the picker before printing an "Approved Raw Material" label, since the system won't stop you from printing one for a batch that isn't actually approved yet.
- Only a PDF download is available; JPEG export has been removed for all four label types.
- The Raw Material label pickers only list actual raw material purchases — packaging item purchases won't show up there.

### Certificate of Analysis

**Where to find it:** Quality Control & Documents → Certificate of Analysis

**Who can use it:** Anyone signed in can view certificates. Creating a certificate, and setting up test templates, is limited to System Admin, Quality Checker, and QC Reviewer.

**What it's for:** Generates an official Certificate of Analysis (COA) for a Raw Material or Finished Product batch that has already passed Quality Control. You enter the actual test results against a fixed list of tests for that item type, and the app produces a print-ready, letterhead-formatted PDF certificate.

**How to generate a certificate**
1. Go to Certificate of Analysis and click **New COA**.
2. Choose whether you're certifying a **Raw Material** or a **Finished Product** batch.
3. Search for and select the specific batch. Only batches that have already been **Approved** in Quality Control show up in this list.
4. If the item (or, for finished product, the MFR) doesn't have a COA template yet, you'll see a message with a link to it instead of a form — a template has to exist before a certificate can be generated.
5. Once a template is found, review the certificate header fields (batch number, dates, quantities, etc.). These are pre-filled from the batch and QC record, but every field can be edited — some wording (like sampled quantity) is meant to be adjusted by hand.
6. For each row in the Test Results table, enter the actual **Result**. The S.No., Test, and Specification columns come from the item's (or MFR's) template and can't be changed here.
7. Check the **Remarks** line at the bottom — it defaults to "The above sample complies/Not complies as per IHS." Edit it to say what's actually true for this batch (e.g., delete whichever of "complies" / "Not complies" doesn't apply).
8. Click **Generate certificate**.
9. On the certificate's own page, click **Download PDF** to get the final letterhead certificate. (Analyzed-by / Approved-by lines are left blank for a physical signature.)

**Setting up test templates**
Every raw material and every finished-product MFR has its own COA template: a list of Tests and Specifications. You can define it when you first add the item or MFR (optional), or later from the item page / MFR page (card "Certificate of Analysis template"). The serial number is assigned automatically; saving replaces the list, and each save is kept in the template's history. Who can edit follows who can edit the item (or MFR). **COA Template Register** (link on the Certificate of Analysis list) lists every item and MFR with its template status, test count and last change, and exports to Excel and PDF.

If you need to set up templates for many items at once, use **Admin → Bulk Data Upload** and pick the Certificate of Analysis Templates option — fill in Code (raw-material item code or MFR code) / Test / Specification in one spreadsheet.

**Fields you'll be asked for**
- **Raw Material / Finished Product** — which kind of batch you're certifying; this determines which picker and which template (recipe-based vs. raw item) is used.
- **Batch picker** — only lists batches already marked Approved by Quality Control; a batch that's still pending or under test won't appear.
- **Certificate header fields** — pre-filled from the batch/QC record (e.g. batch number, manufacturing date, analysis date) but always editable before you submit.
- **Result** — the actual value/finding you record for each test on the template; Test and Specification themselves are read-only, copied from the template.
- **Remarks** — the closing statement printed at the bottom of the certificate.

**How it connects to the rest of the app**
A batch can only be certified once it has an Approved result in Quality Control, and templates belong to the individual raw-material item or MFR. Certificates generated the current way are separate from a small number of older certificates that were created before this screen existed — those still show a plain external file link instead of an on-screen preview and PDF download.

**Good to know**
- If a batch you expect to see is missing from the picker, its QC status is probably not Approved yet — check Quality Control first.
- Editing a template later never changes a certificate that was already generated — each certificate keeps a permanent snapshot of the tests and results it was created with.
- You can set up a template on the item or MFR page, or many at once through Bulk Data Upload — both write to the same place.

### SOP / STP Documents

**Where to find it:** Admin → SOP / STP Documents

**Who can use it:** Anyone signed in can view and open documents. Uploading a new document is limited to System Admin, Quality Checker, and QC Reviewer.

**What it's for:** A simple, searchable library of Standard Operating Procedure (SOP) and Standard Testing Procedure (STP) documents. It's a versioned list of links to files, not a review or approval workflow — you upload a document elsewhere (e.g. a shared drive) and record its link, type, title, and revision number here.

**How to add a document**
1. Go to SOP / STP Documents and click **New document**.
2. Choose the **Document type** — SOP or STP.
3. Enter the **Title**.
4. Enter the **Revision number** (defaults to 0).
5. Paste the **File URL** — a link to where the actual file is stored; there's no file upload here, only a link.
6. Optionally set the **Effective date**.
7. Save. You'll be returned to the list with a confirmation banner.

**Fields you'll be asked for**
- **Document type** — SOP or STP; shown as a badge in the list and searchable by typing "sop" or "stp" in the list's search box.
- **File URL** — a link to the actual document file, not an upload; clicking the file link on the list opens it in a new tab.
- **Revision number** — a plain integer you increase yourself when a document is updated.

**How it connects to the rest of the app**
This module is self-contained — it doesn't read or affect data from Purchase, QC, or Manufacturing. It's simply the place to keep SOP/STP references handy and versioned.

**Good to know**
- There's no edit screen. To update a document, add a new entry with a higher revision number rather than changing the existing one — the old revision stays in the list as a record.
- Because it's just a link, make sure the File URL points somewhere everyone with access to Invento can actually open.

### Audit Log

**Where to find it:** Admin → Audit Log

**Who can use it:** View-only, and restricted to System Admin and Super Auditor. Everyone else who opens the page sees an "Access restricted" message instead of the log.

**What it's for:** A read-only history of who changed what, and when, for the handful of records where proving a decision later actually matters — Quality Control approvals, Finished Product batch status, Purchase Order submission, and MFR (manufacturing record) approvals. It shows the before-and-after values around each change, not just who last touched a record.

**How to look up a change**
1. Go to Audit Log.
2. Optionally filter by table and/or date range using the filters at the top.
3. Scan the list — each row shows When, Table, the affected Record (its own reference number, e.g. AR number, batch number, PO number, or MFR code), the Action (created/updated/deleted), who made the change, and a short summary of what changed (e.g. which status field flipped).
4. Click a row to open its detail page, which shows a full before/after comparison for every field that changed, plus the raw stored data if you need the exact values.

**Fields you'll be asked for**
This is a read-only screen — there's nothing to fill in beyond the optional table and date filters on the list page.

**How it connects to the rest of the app**
The log only covers four record types: Quality Control decisions, Finished Product batch status, Purchase Order submission, and MFR approvals — not every change made anywhere in the app. Every entry links back to the real record it's about.

**Good to know**
- The list caps out at 500 rows per filter — narrow the date range or table if you're looking for something older or don't see it.
- There's no export (CSV/PDF) from this list yet, unlike most other list screens in the app.
- If you can view the page but see "Access restricted," it means your role isn't System Admin or Super Auditor — ask an admin if you need audit access.

---

## Manufacturing

### MFR

**Where to find it:** Manufacturing → MFR

**Who can use it:** Everyone signed in can view MFRs. Only System Admin or MFR Manager can create, edit, or approve one.

**What it's for:** A Manufacturing Formula Record (MFR) is the approved recipe for a finished product — which raw materials, in what quantities, go into one batch. Approving an MFR is also what creates the corresponding Finished Product item in Item Master, so this is the starting point for every finished product Atharva makes.

**How to create and approve an MFR**
1. Go to Manufacturing → MFR and start a new one. Give it a name and, if it's for an already-existing finished product, link it; otherwise a new Finished Product item is created for you on approval.
2. Add one ingredient line per raw material: pick the item and enter the quantity per batch.
3. Save as Draft while you're still working on it — a Draft can be freely edited.
4. When it's ready, click **Approve**. This locks the recipe (no further editing of ingredient lines) and, if this is a new finished product, creates its Item Master entry automatically with an FP- item code.
5. To change an approved recipe later, create a new version rather than editing the old one — this keeps a permanent record of exactly which recipe version was used for any given production run.

**Fields you'll be asked for**
- **Ingredient item + quantity per batch** — one line per raw material; quantities scale automatically when you build a finished product batch at a size other than the recipe's base batch size.
- **Version** — MFRs are versioned; each approved version is kept, not overwritten, so historical batches always point to the exact recipe they were actually made with.

**How it connects to the rest of the app**
An MFR has to be Approved before it can be used to build a Finished Product batch, and approving one is what creates its Finished Product item in Item Master (you never create that item by hand). Every Finished Product batch permanently records which MFR version it was built from.

**Good to know**
- Bulk-uploading an MFR (via Admin → Bulk Data Upload) still lands as a Draft — someone still needs to open it and click Approve before it can be used, exactly like one entered by hand.
- Once approved, a recipe's ingredient lines can't be edited directly — make a new version instead, which keeps old production runs traceable to the recipe that was actually used.

### Finished Product

**Where to find it:** Manufacturing → Finished Product

**Who can use it:** Everyone signed in can view finished product batches. Only System Admin, MFR Manager, or Inventory Manager can compose a new batch.

**What it's for:** This is where a finished product batch is actually built — drawing down QC-approved raw material stock according to an approved MFR recipe, and producing a new finished batch that itself goes through Quality Control before it's considered complete and usable.

**How to build a finished product batch**
1. Go to Manufacturing → Finished Product and start a new batch.
2. Pick the approved MFR (recipe) you're building against, and the batch size.
3. For each ingredient the recipe calls for, the app suggests which raw material batches to draw from — oldest QC-approved stock first (FIFO). Only batches that are fully Approved in QC and not overdue for retest are offered; anything else is unavailable to select.
4. Confirm or adjust the suggested batches (you can substitute among available approved batches for the same item if needed) and submit.
5. The new finished batch is created with its own FP batch number, and the raw material quantities used are deducted from inventory immediately.
6. The new batch then needs its own Quality Control pass, just like a raw material batch, before it's considered complete.

**Fields you'll be asked for**
- **MFR / recipe** — must be an Approved MFR; Draft recipes aren't selectable.
- **Batch size** — scales every ingredient quantity from the recipe automatically.
- **Raw material batch selection** — defaults to the FIFO suggestion but can be adjusted among currently-approved, non-overdue batches of the same item.

**How it connects to the rest of the app**
Finished Product sits downstream of MFR (needs an approved recipe) and Quality Control (needs approved raw material batches to draw from), and feeds Packaging (the finished batch is what eventually gets issued out) and Certificate of Analysis / Label Printing (once the finished batch has its own QC approval).

**Good to know**
- A raw material batch that's pending, rejected, or overdue for retest simply won't appear as an option here — if a batch you expected to use is missing, check its QC status first.
- Building a batch deducts raw material stock immediately on submission, not after the finished batch's own QC passes — so inventory reflects the real-world consumption as soon as production actually starts.

### Packaging

**Where to find it:** Manufacturing → Packaging

**Who can use it:** Everyone signed in can view packaging issue records. Only System Admin, Inventory Manager, or MFR Manager can record a new issue.

**What it's for:** Tracks finished product and packaging material being issued out of the warehouse — either to Store/R&D or into Production — so there's a record of what left, how much, and for what purpose.

**How to record a packaging issue**
1. Go to Manufacturing → Packaging and start a new issue.
2. Choose the issue type — Store/R&D or Production — and the item and batch being issued.
3. Enter the quantity being issued (can't exceed what's currently available for that batch) and any reference/purpose notes.
4. Submit — the issued quantity is deducted from that batch's available stock immediately.

**Packing several pack sizes at once (Store/R&D):** after choosing Store or R&D, add one line for each pack size or batch (for example 200 ml × 50 and 1 ltr × 8 from the same batch). Each line has its own packaging materials and gets its own packaging issue code. The date and department are shared. The form shows the bulk product each line uses and what is left in each batch; if any line can't be saved, none are.

**Issuing several batches to Production at once:** choose Production and add one line per Finished Product batch — quantity to convert, QC, Stability and (optionally) R&D quantity, and the sample unit. Each line becomes its own Raw Material (RM-FP) batch with its own QC and its own packaging issue code. A batch can appear on one line only; if you repeat it, a red message appears under that line and Add line / Save stay greyed out until you fix it. Nothing is saved unless every line is valid.

**Fields you'll be asked for**
- **Issue type** — Store/R&D or Production; mainly affects how the issue is categorized in reporting.
- **Item + batch** — the specific finished product or packaging batch being issued.
- **Quantity** — capped at what's currently available for that batch.

**How it connects to the rest of the app**
Packaging draws from the same stock the Inventory Ledger tracks — an issue here shows up as an outgoing movement there. It's typically the last step for a finished batch before it leaves Atharva's control, aside from the Certificate of Analysis and labels that accompany it.

**Good to know**
- You can't issue more than a batch's current available quantity — the form will stop you rather than letting stock go negative.

---

## Admin

### User Roles & Access

**Where to find it:** Admin → User Roles & Access

**Who can use it:** Viewing your own access is implicit everywhere in the app. This screen's management page — seeing and changing everyone's roles — is visible only to System Admins. Anyone else who opens this page sees a plain "Access restricted" message instead of the tools.

**What it's for:** This is where a System Admin controls what each person in the company is allowed to do in Invento — assigning one or more of the six roles (Inventory Manager, System Admin, Super Auditor, Quality Checker, QC Reviewer, MFR Manager) to each user. A person's roles determine which "Add/Edit" buttons and forms they see across every other module.

**How to change someone's roles**
1. As a System Admin, go to User Roles & Access. You'll see a list of every user, one row each, with a set of six checkboxes showing their current roles.
2. Tick or untick roles for the person you want to change.
3. Click Save on that person's row. The change takes effect immediately — saving replaces that person's entire set of roles with whatever is checked at that moment (so if you only tick one box, all their other roles are removed).

**Fields you'll be asked for**
- **Role checkboxes** — Inventory Manager, System Admin, Super Auditor, Quality Checker, QC Reviewer, MFR Manager. A person can hold any combination, including none.

**How it connects to the rest of the app**
Every "Add," "Edit," and "Delete" control throughout Invento checks the roles assigned here before showing itself. Changing someone's roles on this screen immediately changes what they can do everywhere else, without them needing to log out and back in.

**Good to know**
- Users are listed by name only, not email — so make sure you recognize the person by their display name before changing their access.
- There's no confirmation prompt and no safety lock: if you untick your own System Admin box and save, you lose admin access immediately, with no "last admin" protection. Be careful editing your own row.
- Saving a row always replaces that person's whole role set — there's no way to add just one role without re-checking all their existing ones too, so double-check every box is set the way you want before saving.

### Reports

**Where to find it:** Admin → Reports

**Who can use it:** Every signed-in user can view and export reports. There's no separate write permission for this screen — it's read-only, so there's nothing to restrict.

**What it's for:** Reports is where you pull together the four core registers Atharva needs for day-to-day tracking and audits — raw material stock, QC history, finished product history, and purchases — each as a searchable, sortable table you can filter by date and export as a printed PDF.

**How to pull a report and export it as a PDF**
1. Go to Admin → Reports.
2. Scroll to the report card you need: **RM Stock Report**, **QC Register**, **FP Register**, or **Purchase Register**.
3. Optionally, narrow it down using the **From** / **To** date fields on that card (see below for which date each one filters on).
4. Use the table's built-in search and column sorting to find specific rows.
5. Click **Download PDF** to export exactly the rows currently shown (i.e., whatever your date filter and search have narrowed it down to).

**Fields you'll be asked for**
- **From / To (date range)** — appears on every report card. Each report filters by a different underlying date, since each has a different natural "event date":
  - RM Stock Report filters by the date the item was added.
  - QC Register filters by the date the QC result was reviewed.
  - FP Register filters by the finished batch's finish date.
  - Purchase Register filters by the date the purchase was received.

**How it connects to the rest of the app**
Every report is a live read of records from other modules — RM Stock Report mirrors Item Master and current stock levels, QC Register mirrors Quality Control, FP Register mirrors Finished Product, and Purchase Register mirrors Purchase and Vendor Master. You don't create or edit anything here; if a number looks wrong, fix it at the source module and it will correct itself on this screen.

**Good to know**
- The date filter only narrows down the rows already loaded on screen — it isn't a fresh search, so applying and clearing it is instant.
- The PDF export always matches what's currently on screen, so set your date filter first if you want a narrower export.
- The export is a formatted, printable PDF table (with the usual letterhead), not a native Excel spreadsheet — there's no `.xlsx` download option currently.
- On the Purchase Register, the date column is labeled "Re-Test Date" (when the raw material batch is next due for retesting) — don't confuse it with the QC Register's own "Retest Date" column, which tracks a different thing (when a specific QC result needs to be re-checked).
- QC Register and FP Register are full historical logs — every row shows, including old/inactive ones — unlike most other lists in the app which hide inactive records by default.

### Tester Feedback

**Where to find it:** Admin → Tester Feedback

**Who can use it:** Any signed-in user can submit feedback from any page in the app. Reviewing and responding to submissions (setting a category, status, and notes) is restricted to System Admins — everyone else sees a message saying they need System Admin access if they open the Admin → Tester Feedback screen directly.

**What it's for:** This is the built-in channel for reporting bugs, confusing screens, or suggestions right from wherever you noticed them, without leaving the app. Every submission gets its own ticket number (like FB-0007) so it can be tracked and referenced later, and a System Admin can triage each one and leave a note that the original submitter will see.

**How to submit feedback from any page**
1. On any screen, scroll to the bottom and click **"Feedback & change log — [page name]"** to expand it.
2. Type what you noticed — a bug, something confusing, or a suggestion — in the text box (at least a few words).
3. Click **Submit**. You'll see a confirmation and your new ticket appear in the list below, with a ticket number.
4. As long as your ticket hasn't been reviewed yet ("Awaiting review"), you can click **Edit** to fix the wording or **Delete** to retract it. Once a System Admin has categorized or responded to it, it becomes read-only for you.

**Fields you'll be asked for**
- **Observation** (anyone) — plain-text description of what you saw. This is the only field a regular user fills in.
- **Category** (System Admin, when triaging) — one of Bug, Enhancement, Invalid request, User education, Duplicate, or Other.
- **Status** (System Admin, when triaging) — Awaiting review, Awaiting implementation, Implemented, or Rejected. This is what the submitter sees as the ticket's current state.
- **Notes** (System Admin, when triaging) — a short note explaining the decision (e.g. why something was rejected, or what was changed) — this is visible to the person who submitted the ticket.

**How it connects to the rest of the app**
The feedback box appears at the bottom of every single page, and each submission is automatically tagged with the page it came from — so a System Admin reviewing Admin → Tester Feedback can see at a glance which screen each report relates to. Nothing else in the app reads this data; it's purely a reporting/triage log.

**Good to know**
- A System Admin triaging feedback can filter the list by status using the tabs at the top of the Tester Feedback screen (All, Awaiting review, Awaiting implementation, Implemented, Rejected).
- Ticket numbers (FB-0001, FB-0002, …) are assigned automatically in order and are the easiest way to refer to a specific piece of feedback in conversation.
- Tester Feedback tickets are specifically protected from the Purge Test Data action (see below) — they're never deleted by it, so your submission history survives even a full test-data wipe.

### Bulk Data Upload

**Where to find it:** Admin → Bulk Data Upload

**Who can use it:** Open to anyone, but each module's card is only shown if you already have add/edit access to that module on its own screen — the same permissions that control the regular "New" buttons elsewhere also control what you can bulk-upload here. If you don't have write access to anything, you'll see a plain "no access" message instead of an empty page.

**What it's for:** This is a shared tool for loading many records into Invento at once from an Excel file, instead of entering them one at a time. It currently covers eight areas: Item Master, Vendor Master, Item Type Master, MFR, Purchase, Instrument / Equipment Master, Dead Stock Register, and Certificate of Analysis (COA) Templates. Each one works the same way: download a blank template, fill it in, and upload it back.

**How to bulk-upload records**
1. Go to Bulk Data Upload. You'll see one card for each area you have access to.
2. On the card for the area you want, click "Download template" to get a blank Excel file. It comes with an Instructions sheet explaining the rules, a data sheet with one filled-in example row to copy the format from, and — for most modules — a Reference sheet listing the exact valid values (like active item codes or vendor names) to copy from, so you don't have to guess at spelling.
3. Fill in your rows in the data sheet, following the example row's format. Required columns are marked with an asterisk.
4. Come back to the card, choose your filled-in file, and click Upload.
5. If every row is valid, all of them are imported at once and you'll see a success message with a count. If anything is wrong anywhere in the file, nothing is imported — you'll get a full list of every row that has a problem, so you can fix them all before trying again.

**Fields you'll be asked for**
- **Item/Vendor/Equipment/Purchase order codes** — never include these in your file; they're always assigned automatically by the app when the row is imported, exactly as they would be if you created the record by hand.
- **MFR and Purchase files** — these have multiple rows belonging to one record (e.g. several ingredient lines for one MFR, or several purchase lines for one invoice). Repeat the same MFR Name (for MFR) or the same Vendor Name + Invoice Number (for Purchase) on every row that belongs together.
- **COA Templates** — one row per Test/Specification line, grouped by repeating the same Code (raw-material item code or MFR code); a code that already has a COA template is rejected — edit it from the item or MFR page instead.

**How it connects to the rest of the app**
Each upload writes into exactly the same tables and goes through exactly the same rules as adding one record by hand on that module's own screen — a bulk-uploaded item shows up in Item Master, a bulk-uploaded purchase order shows up in Purchase as a Draft, and so on.

**Good to know**
- Each file is capped at 500 data rows — split a larger batch into multiple files and upload them one after another.
- A bulk-uploaded purchase order always lands as a Draft, exactly like one entered by hand — someone still needs to open it and click Final Submit before it affects stock.
- A bulk-uploaded MFR still needs a manual Approve click before it produces a usable Finished Product item — uploading the recipe alone doesn't approve it.
- If a file is rejected, fix the listed rows and re-upload the whole file from scratch — there's no partial import and no pre-filling of a corrected file with what was already valid.

### Opening Stock

**Where to find it:** Admin → Opening Stock

**Who can use it:** Anyone with a role can load opening stock while loading is **open**. Only the System Administrator can close loading, re-open it, or undo a load.

**What it's for:** Before go-live, the stock already on the shelves is loaded from the physical stock count sheet, so the app starts with the right quantities. Raw material, packaging and finished product (packed and bulk) are loaded here. The System Administrator closes loading by hand after the agreed cut-off date. The app keeps no cut-off date of its own.

**How to load**
1. Open the card for Raw Material, Packaging or Finished Product and click "Download template". Fill one row per batch (or lot) from the stock count sheet.
2. Choose the file and click "Check file". Every problem is listed with its Excel row number. Nothing is loaded while any problem remains.
3. When the check says the file is fine, click "Load N rows". All rows are loaded together or not at all, and the load gets a number (OPN-0001, OPN-0002, …).

**Raw material rows** are Approved, Pending QC or Rejected. Approved and Rejected rows carry the old Analytical Report (AR) number exactly as written in the old records, plus the QC approval date. Approved rows also carry the retest date and the manufacturer expiry date. Pending QC rows only need the expiry date and join the normal QC queue. "Retests already done" (0 to 3) counts toward the limit of 3 retests.

**Finished product rows** carry one row per batch: Product Code, Batch No, manufacture date, expiry date, the old AR number and the QC approval date (finished product loaded here is always Approved). Fill "Bulk quantity unpacked" (in the product's own unit), or "Packs in stock" with "Pack size" (for example `100 ml`), or both. The pack size must be in the same family as the product's unit (ml with ltr, g with kg). The batch's total yield is the bulk plus packs × pack size. Packs are recorded as one Store packaging entry dated at the approval date, so they appear in Packaging and can be labelled or issued like any other packs. The bulk stays on the batch and can still be packed later. A product must have an approved MFR before its stock can be loaded.

**Legacy tag:** A batch or AR number loaded here shows a grey "Legacy" tag beside it on the QC (including Awaiting QC and Due for retest), Purchase, Inventory (item page and ledger), Finished Product, Packaging, Labels, COA, Reports and Dashboard alert screens, and a "Source" column in Excel exports. The QC list, RM Report, Finished Product, Packaging, Purchase, Inventory ledger, COA and the three Reports registers also have a Source filter (All / New / Legacy). In the batch pickers on the Wastage, Packaging and new-batch screens the old batches are marked "(Legacy)". Batch numbers and AR numbers that look like ones made by the app are refused, so an old number can never be mistaken for a new one.

**Undo:** While loading is open, the System Administrator can undo a load if none of its stock has been used and no new QC record has been started on its batches. For finished product, a load can no longer be undone once any of its packs have been issued, new packaging has been done against its batches, or a COA has been made.

### Company Details

**Where to find it:** Admin → Company Details

**Who can use it:** Everyone can see the details. Only the System Administrator can change them.

**What it's for:** The company name, address and licence number printed on reports, intimation slips, Certificates of Analysis, labels and the Word documents (MFR and BMR). On every printout the logo is on top with the company name directly below it, then the address and licence number.

**To change the licence number (or the name or address):** open the screen, edit the box, and click Save. The next report or document you download shows the new value. Files you downloaded earlier are not changed. The fields are company name, address, licence label (for example "Mfg. Lic. No.") and licence number (for example PD/AYU/111). Each change is recorded in the Audit Log.

### Purge Test Data

**Where to find it:** Admin → Purge Test Data

**Who can use it:** System Admin only. Anyone without that role who opens this page sees an access-restricted message and cannot proceed.

> **Warning — this permanently deletes real data with no undo inside the app.** Purge Test Data wipes out essentially every business record in Invento — every item, vendor, item type, MFR recipe, purchase order, quality check, finished product batch, BMR record, packaging issue, equipment entry, dead-stock entry, and inventory ledger transaction, including all legacy (LEG-) data. This cannot be reversed from within the app. Only use it when you deliberately want to reset the system to a blank slate for testing — never on a whim, and never without a backup you can restore from if needed.

**What it's for:** This screen exists so testing can start from a completely clean system — no leftover items, purchase orders, QC history, or production records — without having to delete everything by hand. It's specifically for setting up end-to-end test runs, not for routine cleanup or fixing a single mistake.

**How to purge test data**
1. Go to Admin → Purge Test Data (requires System Admin access).
2. Read the warning banner at the top of the page — it reminds you to take a backup first if there's anything you might still need.
3. Click **"Purge test data…"** to reveal the confirmation form.
4. Read the detailed warning that appears, listing everything that will be deleted.
5. In the confirmation box, type the exact phrase **PURGE ALL DATA** — the purge button stays disabled until this matches exactly.
6. Click **"Purge everything."** The button shows "Purging…" while it runs.
7. When it finishes, you'll see a summary listing how many rows were removed from each table, and a total count.

**Fields you'll be asked for**
- **Confirmation phrase** — you must type `PURGE ALL DATA` exactly (same spacing and capitalization) before the delete button becomes clickable. This is a deliberate safety check, not a password — its only purpose is to stop an accidental click.

**How it connects to the rest of the app**
Running this clears out data across nearly every module at once — Item Master, Vendor Master, Purchase, Quality Control, Finished Product, MFR, Packaging, Equipment, and the Dead Stock Register will all appear empty afterward, and the Dashboard/Reports screens will reflect zero records too. Numbering for items, purchase orders, AR numbers, MFR recipes, equipment, and dead-stock entries also resets, so the next record of each type created afterward starts again from "-0001."

**Good to know**
- **This cannot be undone from inside the app** — there is no recycle bin or restore button. Take a backup before you click it if there's anything you might need later.
- Your own account, every user's role assignments, and all Tester Feedback tickets are specifically kept — this action only clears business/inventory data, not accounts or feedback history.
- Only System Admins can even see this button in an active state; everyone else is blocked at the page level.
- Because record numbering resets to "-0001" afterward, this is meant for a genuine from-scratch testing reset, not a quick way to remove one bad entry — for that, edit or delete the specific record in its own module instead.

### Legacy / deprecated modules

These modules were part of Invento at one point but are no longer expected to be used. They're kept under Admin, marked "- Deprecated," so their historical entries stay available for reference without cluttering the main workflow. There's no plan to develop them further.

**Batch Mfg. Record- Deprecated** (Admin → Batch Mfg. Record- Deprecated) — the original Batch Manufacturing Record workflow (weighment lines, in-process observations, sign-off) for a production run. Superseded by the current Finished Product + MFR flow described above. Existing records remain visible for historical reference.

**Line Clearance- Deprecated** (Admin → Line Clearance- Deprecated) — used to log a simple pre-production check confirming a production line was clean and ready before a run started (an Area, an optional batch reference, and a Clear / Not clear result). Existing entries remain visible for historical reference, but there's no guidance to keep adding new ones.

**Environmental Control- Deprecated** (Admin → Environmental Control- Deprecated) — used to log Temperature and Humidity readings for a given Area. It never had out-of-range alerting — readings were recorded as-is, with no automatic pass/fail judgment. Existing readings remain visible for historical reference.

---

## Glossary

**AR (Assign Record)** — a Quality Control record, one per batch assigned for testing. Numbered `ARRM-0001/26` for raw material and `ARFP-0001/26` for finished product (a 4-digit running number per type, then the year; each type starts again at 0001 every year, and after 9999 it simply continues as 10000). Numbers issued before 3 Oct 2026 keep the old form, for example `AR-001-22092026`.

**Batch** — a specific received lot of a raw material or packaging item (from one Purchase line), or a specific production run of a finished product. Every batch has its own batch number and its own QC/stock history, even if it's the same item as another batch.

**COA (Certificate of Analysis)** — the official document certifying that a batch meets its specifications, generated from QC-approved test results. Numbered like `COA-0001-2026`.

**Draft** — the editable starting state of a Purchase Order or MFR before it's submitted/approved. Nothing in a Draft affects stock or production until it's finalized.

**FIFO (first-in, first-out)** — the principle Invento uses to suggest which raw material batch to consume first when building a finished product batch: the oldest QC-approved stock is suggested before newer stock.

**Item code prefixes** — every item, vendor, and other master-data record gets an automatic code so you never have to invent or type one yourself:
- `RM-####` — raw material item
- `PKG-####` — packaging item
- `FP-####` — finished product item (created automatically when an MFR is approved)
- `V-####` — vendor
- `MFR-####` — MFR (recipe) record
- `PO-####` — purchase order
- `EQ-####` — equipment/instrument
- `DS-####` — dead stock register entry
- `FB-####` — Tester Feedback ticket
- `LEG-…` — a record imported from the legacy (pre-Invento) system, rather than created in the app

**MFR (Manufacturing Formula Record)** — the approved recipe for a finished product: which raw materials, in what quantities, make one batch.

**QC two-round review** — the mandatory Quality Control process every batch goes through: Round 1 (Quality Checker) and Round 2 (QC Reviewer), performed by two different people, both of whom must approve before the batch is usable.

**Retest** — a scheduled re-check of a batch after its Retest Period has elapsed, using the stability sample set aside at Purchase time. A batch overdue for retest is treated the same as a not-yet-approved batch — it can't be used until it clears retest.

**Role** — one of six permission groups (Inventory Manager, System Admin, Super Auditor, Quality Checker, QC Reviewer, MFR Manager) assigned per person on User Roles & Access; a person can hold several at once. See [What your role lets you do](#what-your-role-lets-you-do).

**Submit / Final Submit** — the action that turns a Draft purchase order into a real, stock-affecting record. Before submission, nothing on the order is visible anywhere else in the app.

---

## FAQ & troubleshooting

**I can't find an "Add" or "New" button on a screen I should be able to write to.**
Your assigned role(s) probably don't include write access for that module. Check [What your role lets you do](#what-your-role-lets-you-do), or ask a System Admin to check your roles on User Roles & Access — remember, viewing is open to everyone, but adding/editing is role-gated per module.

**A batch I expect to see isn't showing up in a picker (e.g. when building a Finished Product batch, generating a COA, or printing a label).**
This is almost always a Quality Control status issue. The batch must be fully **Approved** (both QC rounds) and not currently overdue for retest to appear in most downstream pickers. Check its status on the Quality Control screen first.

**I submitted a purchase order by mistake and need to fix a line.**
Only a System Admin can reopen a submitted purchase order (this reverses the stock it pushed and unlocks the lines for editing). Ask a System Admin to use the **Reopen** button on the order's detail page.

**I made a mistake on a line in a Draft purchase order.**
You can't change the item, batch number, or unit on a saved line — delete the line and re-add it correctly (only possible while the order is still a Draft; once submitted, only a System Admin can reopen it first).

**My bulk upload file was rejected.**
Nothing is imported if any row has a problem — the error list tells you exactly which rows and what's wrong. Fix those rows in your file and re-upload the whole file; there's no partial import or automatic correction.

**I need to update an existing COA test template but bulk upload rejected it.**
Bulk upload only accepts items/MFRs that don't already have a template. To change an existing template, open the item or MFR page and use Edit on its COA template card.

**Something looks wrong on the Dashboard or a Report.**
Both are live reads of the same data every other screen uses — there's no separate "reporting" data to fix. Go to the source module (Item Master, Purchase, QC, etc.) and correct the record there; the Dashboard and Reports will reflect the fix automatically.

**I noticed a bug or something confusing and want to report it.**
Scroll to the bottom of whatever page you're on and use the **Feedback & change log** box — it automatically tags your report with the page you were on, and you'll get a ticket number to reference. See [Tester Feedback](#tester-feedback).

**Who can I ask if I'm stuck on something not covered here?**
Your System Admin is the right first stop for access/permission questions. For anything about how a specific screen behaves, use the Feedback box on that screen — it's read by a System Admin and is also how this guide gets updated.

---

## How this guide stays current

This guide is written and maintained alongside the app itself, from the same source of truth developers use (`docs/modules/*.md` and `docs/DESIGN.md` in the Invento codebase), so its "Where to find it," "Who can use it," and step-by-step instructions are checked against the actual current screens and permission rules, not just remembered from when a feature first shipped.

When Invento's screens, navigation, or roles change in a way that affects how you use the app, this guide is updated and a new PDF is published to the same download link inside the app (Overview → User Guide) — you don't need to look for a different link or version number, the one you have bookmarked will always serve the latest edition. The version note at the very top of this guide shows when it was last updated.

If you notice this guide is out of date, wrong, or missing something, please say so using the **Feedback & change log** box at the bottom of any page (see [Tester Feedback](#tester-feedback)) — that's the fastest way to get a correction into the next update.
