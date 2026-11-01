# Invento User Guide

**A complete guide to Invento, Atharva's system for inventory, quality control and manufacturing.**

*Version: 1 November 2026 · This guide is updated whenever the app changes in a way that affects how you use it. See "How this guide stays current" at the end.*

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
    - [Stock Integrity Check](#stock-integrity-check)
    - [Legacy / deprecated modules](#legacy--deprecated-modules)
11. [Glossary](#glossary)
12. [FAQ & troubleshooting](#faq--troubleshooting)
13. [How this guide stays current](#how-this-guide-stays-current)

## Welcome to Invento

Invento is Atharva's system of record for everything between "a vendor delivers raw material" and "a finished, labelled, certified product is ready to ship." It replaces paper registers and spreadsheets with one connected system. Every raw material batch, quality check, recipe, production run and certificate is entered once and then reused wherever it's needed.

This guide is for everyone who uses Invento day to day: recording a delivery, running a quality check, building a batch or looking something up. You don't need to read it cover to cover. Use the table of contents to jump to the screen you're working on. To see how everything connects first, read [The big picture](#the-big-picture-how-data-flows-through-invento).

Each module section below follows the same pattern, so you always know where to look for a given kind of answer:

- **Where to find it**: the exact menu path in the sidebar.
- **Who can use it**: who can view the screen, and who can add, edit, or delete on it.
- **What it's for**: the plain-language purpose of the screen.
- **How to…**: step-by-step instructions for the main things you'll do there.
- **Fields you'll be asked for**: what each important field means and any rules around it.
- **How it connects to the rest of the app**: what feeds into this screen and what it feeds into.
- **Good to know**: practical tips, edge cases, and things that trip people up.

## Getting started

### Signing in

Go to Invento's sign-in page and enter your email and password. A System Admin creates every account; you can't register yourself. If you don't have an account yet, ask your System Admin. You'll get a temporary password and choose your own the first time you sign in. The roles the System Admin gives you decide which screens and actions you can use (see [What your role lets you do](#what-your-role-lets-you-do)). Until you have a role, you can view the app but won't see Add or Edit buttons.

**Automatic sign-out.** To protect a PC left unattended, Invento signs you out after a period without activity (60 minutes unless your System Admin has changed it, or switched it off). A reminder appears two minutes before, with a **Stay signed in** button. System Admins are not signed out this way. Anything you had not saved is lost, so save long entries as you go.

Forgot your password? Use the **Forgot password** link on the sign-in page to receive a reset link by email, then set a new password on the page it takes you to.

### Finding your way around

Once you're signed in, you'll always see the same layout:

- **Sidebar (left)**: every module you have access to, in seven groups: Overview, Master data, Procurement, Quality Control & Documents, Manufacturing, Reports & checks (Reports, Audit Log, Stock Integrity Check), and Admin. (SOP / STP Documents sits under Admin in the sidebar.)
- **Top bar (right)**: your name and assigned role(s), a live **low stock** alert badge when any item has fallen below its reorder threshold (click it to jump straight to Item Master), a **Profile** link, and **Sign out**.
- **Main area**: the screen you're currently on.

**Lists and tables.** Every list has a search box above it. Where a column heading shows a small up/down mark, click it to sort by that column. Click again to reverse the order, and a third time to go back to the original order. The sort covers the whole list, not just the page on screen, and the Excel and PDF downloads too. On a phone, the menu and buttons are larger, the first column stays in view while you swipe a wide list sideways, and a note shows when there is more to the right. Keyboard users can press Tab once on any page to reveal a **Skip to main content** link.

**PDF downloads.** PDFs print the rupee sign and letters with marks correctly; Hindi text prints too, without the joined letter forms. A PDF holds at most 3,000 rows: if a list is longer, narrow it first or use the Excel download.

**Show inactive.** The Vendor Master, Instrument / Equipment Master and Dead Stock Register lists hide inactive records until you tick **Show inactive** above the list (the tick appears only when at least one record is inactive). Inactive records carry a grey Inactive tag, and the Excel download has a Status column.

**Two people editing the same record.** On the Item, Vendor and purchase order invoice-details forms, if someone else saves the same record while you are editing it, your save is refused with "Someone else changed this record while you were editing it. Nothing was saved. Reload the page to see their change, then make your edit again." Reload, check their change and enter yours again.

**Typing a date.** Every date box reads **dd-mm-yyyy** (day first), whatever language your computer uses. Type it as 05-10-2026, 5/10/2026 or 05102026, or click the calendar at the right of the box. If the date does not exist or is outside the allowed range, the box says so when you save.

**Dates and limits.** A date for something that has already happened can't be in the future. That covers the invoice date, received on, batch start and finish, issue date, calibration, dead stock purchase and resolution, and the report and audit filters. Quantities, prices and text have upper limits too, for example 1,000,000 kg or ltr, a unit price of ₹10,000,000 and names of 200 characters. The message names the field to correct.

At the bottom of every page is a **Feedback & change log** box. It's the fastest way to report something confusing or broken from the place you noticed it. See [Tester Feedback](#tester-feedback) for details.

### Your profile

Click **Profile** in the top bar to see your account details (email and roles) and your display name, or to change your password; it asks for your current password first. Only the System Administrator can change your display name (ask them on User Roles & Access), because it appears on QC decisions, certificates and the audit trail.

### First-time orientation

If you're brand new to Invento, the fastest way to get oriented is:

1. Open the **Dashboard** (the first screen after you sign in) to see what's in the system now: stock, pending quality checks and recent production.
2. Read [The big picture](#the-big-picture-how-data-flows-through-invento) below to understand how a batch of raw material moves through the app from delivery to finished product.
3. Check [What your role lets you do](#what-your-role-lets-you-do) to see which specific screens and actions apply to your job.
4. Jump to the module section for whatever you're about to do.

## The big picture: how data flows through Invento

Invento follows one continuous chain. Knowing it is the most useful thing you can learn about the app: almost every "why can't I do X" question comes down to where a record is in this chain.

**1. Purchase: material arrives.**
A purchase order records a vendor delivery, with one line per item received. While it's a Draft, it doesn't affect stock, and you can edit or delete its lines. **Submit order (locks lines)** is the step that matters: it locks the order and adds the received quantity, less the QC, Stability and R&D samples, to inventory as a new batch. A System Admin can reopen a submitted order, but only until QC has started on one of its batches.

**2. Quality Control: material is cleared for use.**
Every batch from Purchase must pass Quality Control before anyone can use it. QC is a **two-round check**: a Quality Checker reviews the batch first and, only if they approve, a *different* person, the QC Reviewer, makes the final decision. A batch that is rejected, still pending, expired or overdue for retest is **blocked everywhere else in the app**. The app itself won't let you pick it when you build something downstream.

**3. Inventory Ledger: stock is tracked.**
Every stock movement goes into one ledger automatically: material received, QC samples, material used in production, packaging issued and wastage. Check here what's on hand now, or what was on hand on a past date.

**4. MFR: the recipe is defined and approved.**
A Manufacturing Formula Record (MFR) is the approved recipe for a finished product: which raw materials, and how much of each, make one batch. An MFR must be approved before you can build product from it. Approving a new MFR also creates its Finished Product item in Item Master, so you never create finished-product items by hand.

**5. Finished Product: the batch is built.**
A finished product batch is built from an approved MFR and draws on QC-approved raw material stock. The app takes the oldest approved stock first and reserves it at once. When production is finished, you complete the batch, and it goes through its own QC review before it can be packed, labelled or certified.

**6. Packaging: the batch is issued.**
Finished product and packaging materials are issued to Store, R&D or Production, so you can see what left the warehouse and why.

**7. Certificate of Analysis and Label Printing: the paperwork is produced.**
Once a batch (raw material or finished product) has cleared QC, you can generate its Certificate of Analysis from the tests and specifications set for that item. You can also print its shop-floor labels (Approved Raw Material, Under Test, In-process, Finished Product) from the same batch and QC data. Neither screen changes any data; they only format what's already recorded.

Two things run alongside the chain rather than as steps in it. **Reports and the Dashboard** show live totals of everything above, so you don't have to visit each module. The **Audit Log** keeps a permanent history that nobody can edit: who created, changed or deleted records (QC decisions, purchase orders, production, packaging, masters, user roles) and who signed in.

## What your role lets you do

Everyone signed in to Invento can **view** nearly everything; you don't need special access to look something up. Your role(s) decide what you can **add, edit, delete or approve**. You can hold more than one role, and a System Admin manages roles on the [User Roles & Access](#user-roles--access) screen.

- **Inventory Manager**: creates and submits purchase orders, manages Item Master/Vendor Master, records wastage in the Inventory Ledger, and contributes to Finished Product and Packaging.
- **System Admin**: the broadest role. Can do everything the other roles can, plus actions nobody else has: managing user accounts, roles and display names; deleting master-data records; reopening a submitted purchase order (before QC has started on it); closing or reopening Opening Stock and undoing a load; changing Company Details and the automatic sign-out time; running the Stock Integrity Check; and running Purge Test Data. System Admins are never signed out automatically. If something is blocked and you don't know why, ask a System Admin.
- **Super Auditor**: a read-focused role with one specific extra: access to the Audit Log (alongside System Admin).
- **Quality Checker**: performs Round 1 of the two-round QC review, starts QC on new batches, records wastage, and can act on Certificates of Analysis, SOP/STP Documents, Equipment, and Dead Stock.
- **QC Reviewer**: performs Round 2 (the final decision, including setting the expiry date) of the two-round QC review, plus the same start-QC, wastage and COA/Documents/Equipment/Dead Stock access as Quality Checker. The same person can never do both QC rounds on the same batch.
- **MFR Manager**: creates and approves MFRs (recipes), builds Finished Product batches, and contributes to Item Master, Packaging, and Equipment.

A handful of things are open to **any** signed-in user regardless of role, because they're either informational or self-service: viewing every module, submitting Tester Feedback, printing labels, generating reports, loading Opening Stock while loading is open, and managing your own Profile.

## Overview

### Dashboard

**Where to find it:** Overview → Dashboard

**Who can use it:** Every signed-in user. It's the home page, and viewing it needs no particular role.

**What it's for:** The Dashboard is the first screen you see. It sums up the whole business at a glance: stock, purchase orders and QC checks in progress, and how production is going. It reads live from the same data as every other screen, so it's always current.

**How to check what needs your attention today**
1. Open Invento. You land on the Dashboard.
2. The first card, **My tasks**, shows how many records wait for you, from your roles (for example QC records waiting for Round 1, or batches to complete). Click a line to open its screen.
3. If anything needs action, warning cards follow: **Low stock** (raw materials whose usable quantity has dropped below their reorder threshold), **Finished product batches in progress** (batches started but not yet completed), **Retest overdue or due in the next 90 days**, and **Expired or expiring in the next 90 days**. A card only appears when there's something to flag.
4. Below them is the row of summary cards (Raw materials, Vendors, MFR definitions, Finished batches, POs in the last 30 days, Pending QC). Click any card to jump straight to that module.
5. Click any item in the warning cards to go straight to the relevant screen (Item Master, Finished Product or Quality Control).
6. Scroll down to see four charts: inventory movement in and out over the last 30 days (one chart for each unit), QC results by status, purchase value over the last 30 days, and finished batches produced over the last 30 days.

**How it connects to the rest of the app**
You don't enter anything here. Every number and chart reads live from records in Item Master, Vendors, Purchase, QC, MFR and Finished Product. There's no separate reporting step: the Dashboard shows a change on your next visit.

**Good to know**
- The "Hide legacy data" checkbox in the top-right corner is a personal display setting, not a delete. It hides old records (LEG- codes and batches loaded through Opening Stock) from lists, alerts and dropdowns across the app, in your browser only, and you can switch it back any time.
- Warning cards appear only when there's something to flag. No cards between My tasks and the summary cards is a good sign, not a fault.
- The "Pending QC" count includes records waiting at either QC round, so it can be higher than the number not yet checked at all.

## Master data

Master data is the base everything else builds on: your lists of items, vendors, equipment and item categories. Set them up, or check they exist, before you record a purchase, run QC or build a recipe.

### Item Type Master

**Where to find it:** Master data → Item Type Master

**Who can use it:** Everyone can view it. Only System Admin, Inventory Manager, or MFR Manager can add or edit item types. Deleting an item type is System Admin only.

**What it's for:** Item types are the categories you give items in Item Master (for example "Herb Powder" or "Bottle Cap"). This screen is a flat list of those categories: add them here first, then pick from them when you create an item.

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
- **Description**: the category name. It must be unique (capitals, extra spaces and a final full stop are ignored), so adding one that already exists gives an error.
- **Active**: only appears on the edit screen; unticking it hides the item type from pickers elsewhere without deleting its history.

**How it connects to the rest of the app**
Every item in Item Master can be tagged with one item type, and several bulk-upload templates (Item Master, MFR) let you reference an item type by its exact description. The list shows both active and inactive item types together, since the whole point of this screen is to manage that toggle.

**Good to know**
- You can't delete an item type that any item uses. Move those items to another type first, or deactivate the item type instead.
- Adding a description that already exists (even with different capitalization is fine, but an exact duplicate isn't) will be rejected with a clear message rather than creating a duplicate.

### Item Master

**Where to find it:** Master data → Item Master

**Who can use it:** Everyone can view it. Only System Admin, Inventory Manager, or MFR Manager can add or edit items. Deleting an item is System Admin only.

**What it's for:** The master list of every raw material and packaging item Atharva stocks: names, codes, units, barcodes and current stock. Purchase, the Inventory Ledger, QC and Manufacturing all build on it. Finished Product items aren't created here; the MFR screen creates them.

**COA template column:** the list shows, for every raw material and finished product, whether its Certificate of Analysis template is **Defined** or **Missing**. A Missing row has an **Add** link that opens the item's page (raw material) or the MFR's page (finished product) at the template card. A finished product with no MFR shows "No MFR"; packaging shows a dash (no COA). A certificate cannot be issued for a batch until its template exists. You can sort by the column, and the Excel download includes it.

**How to add a new item**
1. Go to Item Master and click "New item."
2. Choose a Category: Raw material or Packaging. (You can't create a Finished Product item here; approving an MFR creates it.)
3. Fill in the Name and any other fields that apply, then save.
4. You'll land on the item's detail page with its item code already assigned, and a one-time "successfully added" banner confirms it.

**How to edit an item**
1. From the list, click the item's code or name to open its detail page.
2. Change any field except the item code, which is permanent, and the category once it is fixed. A Finished Product item's category is always locked. A Raw material or Packaging item's category locks once the item has purchases, recipes, QC records or stock movements; if you picked the wrong one, create a new item.
3. Save. Changes take effect immediately; there's no approval step.
4. System Admins also see a Delete button here, which asks for confirmation before permanently removing the item.

**Fields you'll be asked for**
- **Item code**: shown as a read-only preview while creating (e.g. "RM-006" for a raw material; after RM-999 it carries on as RM-1000); the real code is only assigned once you save, and it never changes afterward.
- **Botanical Name**: an optional alternate/scientific name for the raw material.
- **Category**: Raw material or Packaging only when creating; it shows locked and read-only for Finished Product items and for any item that already has records.
- **Active**: un-ticking it is refused while the item still has stock on hand (write the stock off or use it up first); the form also tells you when the item is used in recipes.
- **Item type**: dropdown pulled from Item Type Master's active entries; required for a Raw material.
- **Barcode**: optional, 3 to 40 plain characters (no accents or emoji), and must be unique across all items; if filled in, the item's detail page shows it as a scannable barcode image.
- **Low stock threshold**: optional. When stock falls below it, the item gets a "Low stock" badge. For a raw material the check uses **usable** stock (approved, in date, not due for retest), so material awaiting QC or expired doesn't hide a shortage.

**How it connects to the rest of the app**
Purchase, QC, the Inventory Ledger, MFR and Packaging all use the items on this list: every purchase line, QC sample and MFR ingredient belongs to one of them. Stock on hand is calculated from the purchases, usage and wastage recorded elsewhere; you never enter it here.

**Good to know**
- The newest items come first, so one you've added appears at the top.
- QC, Stability and R&D sample quantities are no longer set here. You enter them on the Purchase screen when a batch arrives.
- You can't delete an item that has any purchase, QC, inventory, production or MFR history. Untick Active instead.
- Both active and inactive items show in the list, so you can always find and reactivate something you'd previously turned off.

### Vendor Master

**Where to find it:** Master data → Vendor Master

**Who can use it:** Everyone can view it. Only System Admin or Inventory Manager can add or edit vendors. Deleting a vendor is System Admin only.

**What it's for:** The master list of the suppliers you buy raw materials and packaging from, with their contact details and vendor code. You pick from it when you create a purchase order.

**How to add a new vendor**
1. Go to Vendor Master. If you have write access, an "Add new vendor" panel sits right next to the list, showing you the vendor code it's about to assign (e.g. "V-0093").
2. Fill in the Name (required) and any contact details you have: address, mobile, phone and email.
3. Save. You stay on the page, the new vendor appears in the list and a message confirms it, so you can add several vendors in a row.

**How to edit a vendor**
1. Click the vendor's name or code in the list to open its detail page.
2. Change any field and save. A message on the page confirms it.
3. To stop using a vendor (for example one that failed an audit or stopped trading), untick **Active** and save. The vendor is no longer offered on new purchase orders, but every earlier order and its history stay. On the list, tick **Show inactive** to see these vendors; tick **Active** again to bring one back.
4. System Admins also see a Delete button here, which asks for confirmation before permanently removing the vendor.

**Fields you'll be asked for**
- **Vendor code**: auto-assigned; shown as a preview while adding, and as the real, permanent code once saved.
- **Email**: optional, but must look like a valid email address if you enter one.

**How it connects to the rest of the app**
Every purchase order is tied to a vendor from this list, so a vendor has to exist here before you can record a purchase from them.

**Good to know**
- Vendors can be made inactive (untick **Active**), and an inactive vendor cannot be chosen on a new purchase order. Inactive vendors are hidden on the list until you tick **Show inactive**. Vendor names must be unique (capitals and extra spaces are ignored).
- You can't delete a vendor that has a purchase order on file. Reassign or remove those orders first.
- The vendor code on the Add form is a preview, not a reservation. If two people add a vendor at the same time, the code you get on save is always correct, even if the preview was briefly out of date.

### Instrument / Equipment Master

**Where to find it:** Master data → Instrument / Equipment Master

**Who can use it:** Everyone can view it. System Admin, Inventory Manager, MFR Manager, Quality Checker and QC Reviewer can add or edit equipment; equipment and calibration matter to both production and QC. Only a System Admin can delete a record.

**What it's for:** The register of instruments and equipment in Atharva's rooms: what each one is, where it is, its asset tag and its calibration status. It's a reference list; it doesn't affect stock or production figures.

**How to add equipment**
1. Go to Instrument / Equipment Master. If you have write access, an "Add" form sits above the list.
2. Fill in the Name at minimum; add Room No., Section, Asset ID, Quantity, and calibration details if known.
3. Save. The new row appears in the list, sorted by Room and then by its equipment code.

**How to edit equipment**
1. Click a row in the list to open its detail page.
2. Change any field, including calibration status and dates, and save.
3. To retire an instrument, untick **Active** and save; it is hidden on the list until you tick **Show inactive**.
4. System Admins also see a Delete button here, which asks for confirmation before permanently removing the record.

**Fields you'll be asked for**
- **Equipment code**: auto-assigned (e.g. "EQ-0001"), shown as a preview while adding.
- **Asset ID**: the tag printed or engraved on the instrument, if it has one. This field must be unique, not the Name: several rows can be called "Wooden Barrels", each with its own Asset ID.
- **Calibration status**: Calibrated / Due / Not Applicable; leave blank if it doesn't apply yet.
- **Last calibration date / Next calibration due**: when the instrument was last checked and when it's due again. The last calibration can't be in the future, and the next due date must come after it. A due date in the past is allowed and means overdue.

**How it connects to the rest of the app**
This is a reference list for equipment records. The Dashboard shows a card for equipment whose calibration is overdue or due within 30 days.

**Good to know**
- Names may repeat. Each row's Asset ID, if it has one, must be different.
- Calibration status follows the dates: Needs calibration rows need a Next due date, and the list shows Calibrated, Due in N days or Overdue.

### Dead Stock Register

**Where to find it:** Master data → Dead Stock Register

**Who can use it:** Everyone can view it. System Admin, Inventory Manager, MFR Manager, Quality Checker, and QC Reviewer can all add or edit records. Deleting a record is System Admin only.

**What it's for:** The register of assets that are written off or no longer in use: what they cost, how much they have depreciated and what value is left. It's reviewed and updated by hand a few times a year.

**How to add a dead stock record**
1. Go to Dead Stock Register. If you have write access, an "Add" form sits above the list, showing you the asset code it's about to assign.
2. Fill in the Name of the article and whatever purchase/depreciation details you have.
3. Save. The row appears in the list, sorted by asset code.

**How to update a record (e.g. after a write-off)**
1. Click the row in the list to open its detail page.
2. Update Balance qty and Balance value by hand when something changes; the app doesn't calculate them.
3. Fill in Resolution date, Rejected qty, and Rejected value if the entry is being written off, and save.

**Fields you'll be asked for**
- **Purchase price**: this is the price per unit, not the total for the whole quantity.
- **Depreciation %**: defaults to 25% if left blank when bulk-uploading; on this screen it's a plain number you enter.
- **Depreciated value / unit**: calculated from Purchase price and Depreciation %: purchase price × (100 − depreciation %). You don't enter it.
- **Balance qty / Balance value**: entered and updated by hand; the app does not keep a running ledger of these for you.
- **Rejected qty / Rejected value**: record how much was written off and its value, when that happens; this is also a manual entry, not a formula.

**How it connects to the rest of the app**
This register is separate from the Inventory Ledger: it doesn't read or change stock on hand anywhere else in the app.

**Good to know**
- Balance qty and Balance value don't change when you record a rejection. Update them yourself.
- Write-offs here have no review or approval step; it's an editable register.
- Because the figures are typed by hand, the form shows an amber warning when Rejected qty, Balance qty and the values don't add up. It never blocks the save. The list's Check column, and the Excel file, repeat it.
- The purchase date and resolution date cannot be in the future, and the resolution date cannot come before the purchase date. To retire a record untick **Active**; it is hidden until you tick **Show inactive**.

## Procurement

### Purchase

**Where to find it:** Procurement → Purchase

**Who can use it:** Everyone signed in can view purchase orders. Only a System Admin or Inventory Manager can create a purchase order, add/edit/delete its lines, or submit it. Once an order has been submitted, only a System Admin can reopen it, and only until QC starts on one of its batches (see "How to submit" below).

**What it's for:** Record goods received from a vendor: one purchase order per vendor invoice, one line per item. A purchase order starts as a Draft you can edit. Its stock joins inventory only when someone clicks **Submit order**; nothing on a Draft changes stock.

**How to create a purchase order and add items**
1. Go to Procurement → Purchase and start a new purchase order. Enter the vendor (only active vendors are listed), invoice number, invoice date and **Received on** date. Received on is the day the goods arrived; it starts as today and prints as Date of Receipt on the raw material label. Neither date can be in the future. The order number is assigned automatically.
2. On the same screen, use the "Add line" form to add each item received: pick the item, and its batch number is generated for you automatically. Enter the quantity received and confirm the unit (it defaults from the item).
3. Enter the QC, Stability and R&D sample quantities and the sample unit for the line. Samples are set aside for testing and don't count as usable stock. All four fields are required: if an item needs no sample, enter **0**, not blank. The form fills in 0 when you pick the item, so you rarely type it.
4. Enter the unit price and GST % and save the line. Both are required: enter **0** if there is none (GST % can be 0 to 100). Each line amount is rounded to the paisa, and the order total adds up the rounded lines. You don't enter an expiry date here; the QC Reviewer sets it when the batch is approved. Repeat for each item on the invoice, or use Bulk Data Upload for many lines. While the order is a Draft, you can edit or delete any line.
   - If the quantity is 10 or more times the last purchase of the same item, a red note appears under the form and **Add line** stays off until you tick "Yes, this quantity is correct". It only checks for an extra zero; a large order that's right saves as normal.
   - The app also refuses values that can't be right: a quantity above 1,000,000 kg or ltr (1,000,000,000 g or ml, 100,000,000 nos or other counts), a unit price above ₹10,000,000, a name over 200 characters or a note over 2,000 characters. The message names the field to correct.

**Correcting invoice details:** on a Draft order (or one that was reopened), click **Edit invoice details** to fix the invoice number, invoice date or received-on date. The vendor can be changed only while the order has no lines. A submitted order stays locked; ask a System Admin to reopen it first.

**How to submit a purchase order so stock becomes available**
1. When every line is correct, click **Submit order (locks lines)** on the order's page, then **Yes, submit** in the red box that asks once more. You submit the whole order, not one line at a time.
2. Submitting adds each line's remaining quantity (received quantity less its QC, Stability and R&D samples) to inventory and locks the order, so its lines can't be edited or deleted.
3. If something was submitted by mistake, a System Admin can click **Reopen**, which reverses the stock that was pushed and unlocks the order for editing. Resubmitting later re-pushes whatever the (possibly corrected) lines say at that point.
4. Reopen is **refused** once QC has a record on any batch of the order (even one still waiting for its first review), once a batch has been used in production or written off, or when QC has rejected a batch of the order. The message names the batch. After QC has started, the order can't be changed.

**Fields you'll be asked for**
- **Invoice date / Received on**: both required and neither can be in the future. Received on is the day the goods arrived and is printed as Date of Receipt on the Approved Raw Material label. Both can be corrected on a Draft order with **Edit invoice details**.
- **Unit price / GST %**: both required on every line (0 is allowed); GST % is 0 to 100.
- **QC Qty / Stability Qty / R&D Qty**: how much of the received quantity is being set aside for each kind of testing. Required on every raw-material line; enter 0 if none is needed for that line.
- **Batch number**: generated automatically the moment you pick the item; you never type this yourself.
- **Remaining quantity**: shown once the line is saved; the quantity received less the three sample quantities.
- **Raw Material / Packaging Item**: choose which kind of line you're adding. Packaging lines skip the QC/Stability/R&D sample fields entirely, since packaging is never sampled.

**How it connects to the rest of the app**
A Draft order doesn't show anywhere else in the app: Quality Control's new-batch picker, the wastage form and the RM stock report list batches from **submitted** orders only. Submitting an order creates the batch, which then goes through Quality Control before it can be used in manufacturing.

**Good to know**
- The QC, Stability and R&D quantities and unit are required. You can't leave them blank, but 0 is fine for a line that needs no sample.
- Reopening a submitted order reverses real stock, so only a System Admin can do it, after a two-step confirmation, and only before QC has started on the order's batches.
- After a line is saved, you can't change its item, batch number or unit; only the quantity, price and sample amounts. Once the line's batch has a QC record, the quantity and samples are fixed too, and only the price and GST % can change. If you picked the wrong item, delete the line and add it again (while the order is a Draft).

### Inventory Ledger

**Where to find it:** Procurement → Inventory Ledger

**Who can use it:** Everyone signed in can view all eight tabs (Ledger, Stock Position, Stock Statement, RM Report, Rejected Materials, Batch Trace, Expiry & Retest Ageing, Retained Samples). Recording wastage is limited to System Admin, Inventory Manager, Quality Checker, or QC Reviewer.

**What it's for:** The record of every stock movement in Invento: material in from Purchase, QC samples, material used for finished product, packaging issued and wastage. It also shows where stock stands: Stock Position (on hand now), RM Report As On Date (raw material stock today) and Stock Statement (opening and closing stock for a period). Everything here comes from other modules except wastage, which you record on this screen.

**How to check current stock on hand**
1. Go to Procurement → Inventory Ledger and open the **Stock Position** tab.
2. Each item shows its current on-hand quantity, with a red "Low stock" badge if it's fallen below that item's threshold, and a short breakdown line (e.g. Received / QC / Stability / R&D / FP use / Wastage) showing where the quantity came from or went. For raw materials, **Usable** shows how much production can actually use today, and **Not usable** shows the rest of what is on hand and why (awaiting QC, retest due, expired).
3. Click an item's name to open its page: the full breakdown, its batches and a ledger of that item's movements.

**How to record wastage**
1. From any tab in Inventory Ledger, click **Record wastage**.
2. Choose the item, then the batch it comes from; the list shows each batch's remaining quantity. A batch is required.
3. Enter the quantity, check the unit and give a reason (required). Submit. The quantity comes off that batch's stock at once.

**Fields you'll be asked for**
- **Batch**: required. It ties the wastage to a specific received lot.
- **Reason**: a short required note on why the material was wasted (spillage, damage, expiry, etc.).
- **Running balance** (Ledger tab column): the item's stock after that row's movement, so you can follow the balance line by line.

**How it connects to the rest of the app**
This module follows everything else. Submitting a purchase order creates the Stock In rows here, starting a QC check creates the sample Stock Out rows, and Finished Product and Packaging add their own rows when batches are made or issued. Wastage is the only entry you create here. The RM Report As On Date, the Ledger and Stock Position show batches from **submitted** purchase orders only; a Draft order's stock doesn't appear.

**RM Report**
Open the **RM Report** tab for a batch-by-batch list of raw material. **PQTY** is the quantity purchased, **SQTY** the samples taken (QC, stability and R&D) and **QTY** the stock left today. Rejected batches are not listed (see Rejected Materials). For stock on a past date use the Stock Statement tab.

**Rejected Materials**
Open the **Rejected Materials** tab to see every batch QC has rejected, raw material and finished product, with the QC, Stability and R&D samples taken from each on the same row. You can search it and export it to Excel or PDF. When QC rejects a raw material batch, what's left of it is taken out of stock on hand (the ledger shows "QC Rejected"), so Stock Position counts only usable material. Wastage recorded against a rejected batch comes off the rejected quantity. A purchase order with a rejected batch can't be reopened.

**Stock Statement**
Open the **Stock Statement** tab to see how stock moved over a period. Choose a **From** and **To** date (and a category if you like) and press **Apply**. Each item shows its **Opening** stock at the start of the From day; what came in (Purchased, Produced, Other in); what went out (Used in production, Packaging, Samples, Wastage, Rejected, Other out); and its **Closing** stock at the end of the To day. For one day, use the same date twice. With To set to today, Closing matches On hand on Stock Position. **Excel** and **PDF** export the rows on screen with the period printed. **View ledger** opens the Ledger for that item and period.

**Expiry & Retest Ageing**
Open the **Expiry & Retest Ageing** tab to see every approved batch that is expired, overdue for retest or coming up: raw material with stock left, raw material made in production, and finished product. The boxes at the top group them (Expired, Retest overdue, Within 30 days, 31 to 60, 61 to 90, Over 90 days); click one to show only that group. Each row shows the retest date, the expiry date and which comes first. **Excel** and **PDF** export what's on screen.

**Retained Samples**
Open the **Retained Samples** tab to see the QC, Stability and R&D samples set aside from each batch, with the batch's QC status and expiry date. For raw material, **Stability left** is the stability sample not yet used by a retest. Search, **Excel** and **PDF** work as on the other tabs.

**Batch Trace**
Open the **Batch Trace** tab to follow one batch for a recall or an inspection. Type a batch number (or part of it) and press **Find batch**, then click **Trace** on the batch you mean. You can search raw and packing material batches, raw material made through production, and finished product batches (full or short number).

- **Made from** lists what the batch was made from, back to the raw material, with the vendor and invoice.
- **Went to** lists where it went: the finished product batches that used it, their QC records and COA, each packaging issue (Store, R&D or Production) and the packing material used, and any samples held, wastage or quantity QC rejected.
- The strip at the top shows how many finished product batches were reached, the packs issued per department, and what is still in stock. Click **Trace this** on any batch to follow that one instead. **Excel** and **PDF** export the whole trace.

**Stock In / Stock Out**
The ledger's Event column shows **Stock In** when stock is added (receipts, batch yields), **Stock Out** when stock is taken (samples, production use, issues), and **Wastage** when it is written off.

**Good to know**
- The Ledger tab shows the 1,000 most recent events. To find something older, use the item, reason and date filters.
- The **RM Report** shows each batch's quantity as it is **today**. It has no date box, because a date would suggest it can show past stock. To see how stock moved over a past period, use the Stock Statement tab, which gives Opening and Closing stock for any dates you choose. Use the Export PDF button to save or print the report.
- Wastage always needs a batch. If an item has no received batch yet, the form won't let you submit.

## Quality Control & Documents

### Quality Control

**Where to find it:** Quality Control & Documents → Quality Control

**Who can use it:** Everyone signed in can view Assign Records (ARs). A System Admin, Inventory Manager, Quality Checker or QC Reviewer can start a new AR (assign a batch for QC). Only a Quality Checker can do the first review round and only a QC Reviewer the second, final round; a System Admin can do either. Nobody but a System Admin can do both rounds on the same batch.

**What it's for:** Quality Control is Invento's most important checkpoint: raw material that hasn't cleared QC can't be used to make anything. Every batch received through Purchase gets a QC check and must pass **two rounds of review** by two different people before its stock can go into production. A batch that's rejected, awaiting review or overdue for retest is blocked; the app enforces this, not just the screen.

**Finished product batches in progress.** When a finished product batch is started (Create batch), it shows in the amber **Finished Product Batches In Progress** card at the top of the Quality Control page and on the Dashboard, so QC can plan in-process testing. Click a row to open the batch. When the batch is completed, it moves to Finished Product Awaiting QC.

**How to start QC on a newly received batch**
1. Go to Quality Control & Documents → Quality Control. Batches that arrived and aren't assigned for QC yet show in the green **Awaiting QC** card at the top.
2. Click **Start QC** on a row, or use **New AR** and pick the item and batch yourself. The sample quantity and unit come from the purchase line; check them and adjust if needed. You don't enter the expiry date here; the QC Reviewer sets it in Round 2.
3. Submit. The batch gets an Assign Record (AR) with an **Analytical Report No.** (for example ARRM-0001/26 for raw material, ARFP-0001/26 for finished product), and its status becomes Awaiting QC, ready for Round 1.

**How to review and approve or reject a batch**
1. **Round 1 (Quality Checker):** Open the AR. With the batch still "Submitted," you'll see the Round 1 form.
   - For a raw material bought from a vendor and for a finished product, the form lists the tests on the item's (or the MFR's) **COA template**. Type the **result** of every test. If the item has no COA template yet, the page says so and links to where it is added; until then you cannot approve (you can still reject).
   - Choose **Approved** or **Rejected** and give a **reason** (at least 3 characters). A reason is needed for either decision and is kept for audit.
   - If **Approved**, the status becomes **Round 1 approved — awaiting review** and the AR moves to the QC Reviewer's queue. Round 1's decision and results are then read-only.
   - If **Rejected**, you are only **proposing** the rejection (you are asked to confirm first). The status becomes **"Round 1 rejection proposed"** and the batch stays in stock until a QC Reviewer decides.
2. **Round 2 (QC Reviewer):** Open the same AR.
   - On an **approved** Round 1, you see the Quality Checker's results next to boxes for the final results. Leave them unchanged to keep Round 1's results. **If you change any, your results are final** and go on the Certificate of Analysis; changed results are highlighted and both versions are kept for audit. Choose **Approved** or **Rejected** and give a reason (at least 3 characters; say why if you changed results). When approving, also enter the **Expiry date** and a **Retest Period (days)**. For raw material the retest period starts at 180 days (6 months), the longest allowed, and you can shorten it. A rejection asks you to confirm.
   - On a **proposed rejection**, either **Confirm the rejection** (the batch is rejected and leaves stock) or **Send it back** to the Quality Checker with a reason. Sending back returns the AR to Awaiting QC and Round 1 starts again; the earlier decision stays in the history.
3. Once Round 2 is decided, the record is final: both decisions and both sets of results are read-only, with the **Decision history** below. Only a batch Approved in **both** rounds can be used to make finished product.
4. **Voiding a rejection:** a QC Reviewer or System Admin can open a rejected AR and use **Void this rejection** with a written reason. The AR returns to Awaiting QC, the stock comes back on hand, and a finished product batch returns to "Submitted to QC". It is not possible once wastage has been written off against the batch.
5. The **Certificate of Analysis** takes its results from QC (the Reviewer's if he edited any, otherwise the Quality Checker's) and shows them locked. A record that was decided before results were recorded keeps typing them on the certificate.

**Fields you'll be asked for**
- **Sample Quantity / Unit**: filled in from the purchase line; check it and confirm.
- **Expiry date**: Round 2 only, and required when approving. It cannot be in the past. On a retest it cannot be later than the expiry the batch was last approved with.
- **Retest Period (days)**: Round 2 only, when approving. You enter it because how long a material stays good varies with the material and the test results. For raw material it starts at 180 days, which you can shorten but not exceed. The app works out the retest date from it.
- **Comments**: a short note explaining the decision, at both rounds.

**How it connects to the rest of the app**
Only a fully Approved batch (both rounds, in date and not overdue for retest) can be picked for a Finished Product batch; the app blocks every other status. When a batch's retest date arrives, it appears in the **Due for retest** card on this page. **Start retest** takes the sample you enter from the stability sample reserved at Purchase (then from stock), and the batch goes through both review rounds again.

**Good to know**
- More roles can assign QC (New AR) than can decide it. Only the Quality Checker and QC Reviewer can do the review rounds; a System Admin can stand in for either.
- The same person can't approve both rounds on the same batch. If you did Round 1, you won't be able to do Round 2 on that same AR.
- A batch at Round 1 approved — awaiting review isn't usable yet; it needs Round 2. Treat a batch as clear only when it shows Approved.
- A retest AR is marked with a small "Retest" badge so you can tell it apart from a batch's first-ever QC check.
- **Two people, one record.** If two people decide the same record at the same moment, the first decision is saved. The second person sees "Someone else has just made this decision" and nothing of theirs is saved. Refresh the page to see the result.
- **Rejected raw material** leaves On hand automatically (see Rejected Materials in the Inventory Ledger).
- **Retest limits for raw material.** After its first approval, a raw material batch can be retested at most **three times**, each retest period at most 180 days, so a batch is covered for up to about 18 months. On the **third retest** the QC Reviewer sets only the Expiry date: there's no retest period, and the material can be used until that date without another retest. A batch past its expiry date is never retested; it shows as Expired and Start retest is refused. The retest date can't fall after the expiry date, so a period that runs past it is refused; enter a shorter one.
- **Finished product follows the same retest cycle.** An approved finished product batch is retested when its retest date arrives: at most three times, at most every 180 days, as for raw material. The QC page shows a **Finished product due for retest** card. Enter the sample and press **Start retest**. The sample comes from the batch's stability sample first, then from its bulk; bulk taken comes off the batch and off On hand. The retest goes through both rounds and gets its own ARFP number and certificate. While a retest is open, after the retest date, or after expiry, the batch **can't be packed or labelled**. If a retest is rejected, the bulk still in stock leaves On hand; packs already made stay as they are. A QC Reviewer or System Admin can void the rejection, which brings the bulk back.

### Label Printing

**Where to find it:** Quality Control & Documents → Label Printing

**Who can use it:** Any signed-in user. Printing a label doesn't save or change anything, so the screen needs no particular role.

**What it's for:** Prints the standard shop-floor labels (Approved Raw Material, Under Test, In-process, Finished Product) from data already recorded in Purchase, Quality Control and Finished Product. The output matches the paper templates used on the floor, ready to print and cut.

**How to print labels**
1. Go to Label Printing.
2. Pick the **Label type**: Approved Raw Material, Under Test, In-process, or Finished Product.
3. Type part of the item name or the batch number in the **Search** box, then pick the batch from the list under it. The list shows the newest matching batches that can have this label, at most 50; if it says more exist, type more of the name or number to narrow it.
4. Check the preview. It shows the label layout with your batch's details filled in.
5. Click **Download PDF**. You get a print-ready sheet of copies of the same label: 6 per page (2×3) for Approved Raw Material, Finished Product and In-process, or 10 per page for Under Test.
6. Print, cut the labels apart, and apply them.

**Fields you'll be asked for**
- **Label type**: determines the layout, wording, and which fields appear.
- **Record**: the purchase batch (raw material labels) or finished product batch (Finished Product label) the label's details are pulled from.

A few fields have no source data in the app yet, so they print as a blank line to fill in by hand: **Retest Period** (when the QC record has none), **In-process Start Date**, and the **Sign** line on every label.

**How it connects to the rest of the app**
This screen only reads data entered elsewhere: batch, vendor and invoice details from Purchase, approval status and retest period from Quality Control, and batch and expiry details from Finished Product. It changes none of it.

**Good to know**
- Each label lists only the batches it fits. Approved Raw Material and Finished Product: batches QC-approved right now (a finished product batch that is expired, past its retest date or being retested is left out). Under Test: batches awaiting a QC decision or due for retest. In-process: any batch that isn't rejected. The search runs on the server, so the page stays fast however many batches there are.
- Only a PDF download is available; JPEG export has been removed for all four label types.
- The Raw Material label lists show raw material purchases only, not packaging purchases.

### Certificate of Analysis

**Where to find it:** Quality Control & Documents → Certificate of Analysis

**Who can use it:** Anyone signed in can view certificates. Creating a certificate, and setting up test templates, is limited to System Admin, Quality Checker, and QC Reviewer.

**What it's for:** Generates an official Certificate of Analysis (COA) for a Raw Material or Finished Product batch that has already passed Quality Control. You enter the actual test results against a fixed list of tests for that item type, and the app produces a print-ready, letterhead-formatted PDF certificate.

**How to generate a certificate**
1. Go to Certificate of Analysis and click **New COA**.
2. Choose whether you're certifying a **Raw Material** or a **Finished Product** batch.
3. Search for and select the specific batch. Only batches that have already been **Approved** in Quality Control show up in this list.
4. If the item (or, for finished product, the MFR) has no COA template yet, you see a message with a link to add one instead of the form. A template must exist before you can generate a certificate.
5. Review the certificate header (batch number, dates, quantities and so on). The fields are filled in from the batch and QC record, and you can edit any of them; some wording, such as the sampled quantity, is meant to be adjusted by hand.
6. For each row in the Test Results table, enter the actual **Result**. The S.No., Test, and Specification columns come from the item's (or MFR's) template and can't be changed here.
7. Check the **Remarks** line at the bottom. It starts as "The above sample complies/Not complies as per IHS." Edit it to fit this batch, for example by deleting whichever of "complies" or "Not complies" doesn't apply.
8. Click **Generate certificate**.
9. On the certificate's own page, click **Download PDF** to get the final letterhead certificate. Long product names and wording wrap inside their box, and if the Remarks and signature lines do not fit under the test table they move together to a new page. (Analyzed-by / Approved-by lines are left blank for a physical signature.)

**Setting up test templates**
Every raw material and every finished-product MFR has its own COA template: a list of Tests and Specifications. You can define it when you add the item or MFR, or later on the item or MFR page (card "Certificate of Analysis template"). Serial numbers are assigned automatically. Saving replaces the list, and each save is kept in the template's history. Whoever can edit the item (or MFR) can edit its template. The **COA Template Register** (link on the Certificate of Analysis list) lists every item and MFR with its template status, number of tests and last change, and exports to Excel and PDF.

To set up templates for many items at once, use **Admin → Bulk Data Upload** and pick Certificate of Analysis Templates. Fill in Code (raw material item code or MFR code), Test and Specification in one spreadsheet.

**Fields you'll be asked for**
- **Raw Material / Finished Product**: which kind of batch you're certifying; this determines which picker and which template (recipe-based vs. raw item) is used.
- **Batch picker**: only lists batches already marked Approved by Quality Control; a batch that's still pending or under test won't appear.
- **Certificate header fields**: filled in from the batch and QC record (batch number, product, AR number, quantities, dates) and locked; only the Sampled Qty wording can be edited. The system checks them again when you save and refuses a certificate whose header or tests differ from the batch or the template.
- **Result**: the actual value/finding you record for each test on the template; Test and Specification themselves are read-only, copied from the template.
- **Remarks**: the closing statement printed at the bottom of the certificate.

**How it connects to the rest of the app**
A batch can be certified only once it is Approved in Quality Control. Templates belong to the individual raw material or MFR. A few older certificates, created before this screen existed, show a link to an external file instead of a preview and PDF.

**Good to know**
- If a batch you expect is missing from the list, it probably isn't Approved in QC yet. Check Quality Control first.
- Editing a template never changes a certificate already generated: each certificate keeps a permanent copy of the tests and results it was made with.
- Templates set up on the item or MFR page and through Bulk Data Upload are stored in the same place.

### SOP / STP Documents

**Where to find it:** Admin → SOP / STP Documents

**Who can use it:** Anyone signed in can view and open documents. Uploading a new document is limited to System Admin, Quality Checker, and QC Reviewer.

**What it's for:** A searchable library of Standard Operating Procedure (SOP) and Standard Testing Procedure (STP) documents. It lists links to files with revision numbers; it has no review or approval step. Store the document elsewhere (for example on a shared drive) and record its link, type, title and revision here.

**How to add a document**
1. Go to SOP / STP Documents and click **New document**.
2. Choose the **Document type**: SOP or STP.
3. Enter the **Title**.
4. Enter the **Revision number** (defaults to 0).
5. Paste the **File URL**: the link to where the file is stored. You can't upload files here, only links.
6. Optionally set the **Effective date**.
7. Save. You'll be returned to the list with a confirmation banner.

**Fields you'll be asked for**
- **Document type**: SOP or STP; shown as a badge in the list and searchable by typing "sop" or "stp" in the list's search box.
- **File URL**: a link to the actual document file, not an upload; clicking the file link on the list opens it in a new tab.
- **Revision number**: a plain integer you increase yourself when a document is updated.

**How it connects to the rest of the app**
This module stands alone: it doesn't read or change data in Purchase, QC or Manufacturing. It keeps your SOP and STP references in one place, with their revisions.

**Good to know**
- There's no edit screen. To update a document, add a new entry with a higher revision number; the old revision stays in the list as a record.
- Make sure the File URL opens for everyone who uses Invento.

### Audit Log

**Where to find it:** Reports & checks → Audit Log

**Who can use it:** View-only, and restricted to System Admin and Super Auditor. Everyone else who opens the page sees an "Access restricted" message instead of the log.

**What it's for:** A read-only history of who changed what, and when, across the app: every create, edit and delete on masters, purchasing, QC, production, packaging, finished products, COA, stock corrections, company settings, opening stock, user roles and accounts. It shows the values before and after each change, not only who last changed a record.

**How to look up a change**
1. Go to Audit Log.
2. Narrow the list with the filters at the top: **Table**, **Action** (created, edited, deleted), **Changed by**, **Record** (type a batch, AR or PO number, or an item or vendor code) and a **From / To** date range. The list updates as you choose.
3. Each row shows when, the table, the record, the action, who made the change and how, and a short summary of the fields that changed (for example "quantity 10 → 12"). Click a column heading to sort the page.
4. Click **View** on a row to open its detail page: a full before-and-after comparison, with field names in words and people, items, vendors, batches and recipes shown by name.
5. The list shows 200 changes at a time, newest first; use **Older** and **Newer** at the bottom to move through them.

**QC decisions:** choose Table → **QC Decision History** to see each round's decision, reason and who made it, one row per step (Round 1, Round 2, proposed rejection, send back, void).

**Sign-ins:** choose Table → **User Account** to see who signed in and out, failed sign-in attempts (the e-mail typed, never the password) and passwords changed by the user. A run of failed attempts on one account is worth a look. After 20 failed attempts for one e-mail in an hour (or 200 in all), the log adds one line saying more were not recorded.

**History on a record's own page:** the Item, Purchase Order, QC record, MFR and Finished Product batch pages show a **History** button (System Admin and Super Auditor only) that opens the Audit Log for that one record.

**Download:** the **Excel** button above the list saves the page on screen. **Download all matching (Excel)** at the bottom saves every change that matches your filters, up to the newest 10,000; the file says if there were more. Both files have Before and After columns.

**Fields you'll be asked for**
This screen is read-only: the filters are the only thing to fill in.

**How it connects to the rest of the app**
The log covers every business record in the app, and every entry links back to the real record it is about. Nobody can edit or delete a log row.

**Good to know**
- The Record box matches what you type against the record's own reference (batch, AR or PO number, code or name) or its full internal id. It doesn't search other fields.
- If the page says "Access restricted", your role isn't System Admin or Super Auditor. Ask an admin if you need audit access.

## Manufacturing

### MFR

**Where to find it:** Manufacturing → MFR

**Who can use it:** Everyone signed in can view MFRs. Only System Admin or MFR Manager can create, edit, or approve one.

**What it's for:** A Manufacturing Formula Record (MFR) is the approved recipe for a finished product: which raw materials, and how much of each, go into one batch. Approving an MFR also creates its Finished Product item in Item Master, so every finished product starts here.

**How to create and approve an MFR**
1. Go to Manufacturing → MFR and start a new one. Give it a name and, if it's for an already-existing finished product, link it; otherwise a new Finished Product item is created for you on approval.
2. Add one ingredient line per raw material: pick the item and enter the quantity per batch.
3. Save as Draft while you're still working on it. You can edit a Draft freely.
4. When it's ready, click **Approve**. This locks the recipe (no further editing of ingredient lines) and, if this is a new finished product, creates its Item Master entry automatically with an FP- item code.
5. To change an approved recipe, create a new version instead of editing it. That keeps a permanent record of which recipe version each production run used.

**Fields you'll be asked for**
- **Ingredient item + quantity per batch**: one line per raw material. Quantities scale automatically when you build a batch of a different size from the recipe's base batch size.
- **Version**: MFRs are versioned; each approved version is kept, not overwritten, so historical batches always point to the exact recipe they were actually made with.

**How it connects to the rest of the app**
An MFR must be Approved before you can build a Finished Product batch from it, and approving it creates its Finished Product item in Item Master; you never create that item by hand. Every Finished Product batch records the MFR version it was built from.

**Good to know**
- An MFR loaded through Bulk Data Upload arrives as a Draft. Someone must open it and click Approve before it can be used, as for one entered by hand.
- An approved recipe's ingredient lines can't be edited. Make a new version instead, so earlier production runs stay linked to the recipe they used.

### Finished Product

**Where to find it:** Manufacturing → Finished Product

**Who can use it:** Everyone signed in can view finished product batches. Only System Admin, MFR Manager, or Inventory Manager can compose a new batch.

**What it's for:** Build a finished product batch: the app draws QC-approved raw material stock according to an approved MFR, and the new batch then goes through its own Quality Control before it can be used.

**How to build a finished product batch**
1. Go to Manufacturing → Finished Product and start a new batch.
2. Pick the approved MFR (recipe) you're building against, the batch size and the batch start date.
3. The next screen works out the quantity of each ingredient and takes the raw material **automatically, oldest QC-approved stock first (FIFO)**, drawing from more than one batch when needed. You do not pick batches yourself. Only batches that are fully Approved in QC and not overdue for retest or expired are used. If an ingredient has not enough approved stock, the screen says so and the batch cannot be created.
4. Submit. The batch is created as a **Draft**, and the raw material is reserved from inventory straight away.
5. A Draft is not yet in production. Click **Create batch** to start production (the batch becomes In Progress and shows on the Dashboard and the Quality Control page), or **Cancel** to release the raw material. A Draft left for more than **30 minutes** cancels itself and the reserved raw material goes back to inventory; a countdown on the batch shows the time left.
6. When production is finished, open the batch and use **Complete batch**. Enter the batch yield, finish date, expiry date, sample unit and the QC, Stability and R&D sample quantities. The form shows the yield as a percentage of the batch size, with the range the MFR allows. If the yield is outside that range, write a reason, which QC can see. A yield above 150% of the batch size is refused as a likely typing mistake. A review step lets you check everything before it's saved. The batch then shows **Complete - Awaiting QC**, and an **After completion** card appears on its page.
7. Click **Submit to QC**. The batch gets an Analytical Report No. (like ARFP-0001/26) and goes through its own Quality Control, like a raw material batch. It can be packed, labelled or certified only after QC approves it. The expiry date QC approves prints as Best Before on the label.

**Fields you'll be asked for**
- **MFR / recipe**: must be an Approved MFR; Draft recipes aren't selectable.
- **Batch size and batch start date**: the batch size scales every ingredient quantity from the recipe automatically.
- **Complete Batch**: batch yield, finish date, expiry date, sample unit, and the QC, Stability and R&D sample quantities (all required). The finish date cannot be in the future or before the start date, and the batch start date cannot be in the future.
- **Batch number**: a full number such as FP-00001-01/26, plus a short one beside it: PR-01/26 for a Domestic product or OR-01/26 for an Export product (set by the Market chosen on the MFR). Screens show both; printed documents and Reports show the short one.

**How it connects to the rest of the app**
Finished Product needs an approved recipe (MFR) and approved raw material batches (Quality Control). It feeds Packaging, which issues the finished batch, and Certificate of Analysis and Label Printing, once the batch has its own QC approval.

**Good to know**
- A raw material batch that's pending, rejected, expired or overdue for retest is never used. If a batch you expected isn't being used, check its QC status first.
- **Retest of a finished batch.** An approved batch is retested when its retest date arrives (see Quality Control). The batch page lists every QC record: **First QC**, then **Retest 1**, **Retest 2** and **Retest 3**. While a retest is open, the batch cannot be packed or labelled, and the bulk left shown on the page already has the retest sample taken off.
- The raw material is set aside as soon as the Draft is saved, not after the finished batch's own QC passes. If the Draft is cancelled, by you or after 30 minutes, the stock goes back.
- **After completion card.** On a completed batch's page, it shows the samples taken, how much bulk packaging has used, how much is left unpacked, and each packing run with a link to Packaging.
- **No correction after Complete.** Once a batch has been completed, its yield, dates and sample quantities cannot be changed on the screen, so use the review step to check them first.
- QC sees a batch as soon as it starts: it shows in the **Finished Product Batches In Progress** card on the QC page and the Dashboard until it is completed.

### Packaging

**Where to find it:** Manufacturing → Packaging

**Who can use it:** Everyone signed in can view packaging issue records. Only System Admin, Inventory Manager, or MFR Manager can record a new issue.

**What it's for:** Record finished product packed and issued to Store, R&D or Production, and the packaging material used, so there's a record of what left, how much and why. Every issue is a pack; there's no repack or unpack.

**How to record a packaging issue**
1. Go to Manufacturing → Packaging and start a new issue.
2. Choose the **department** (Store, R&D or Production) and the **Issue date**. The Issue date is required and starts as today; you can enter an earlier date, but not a future one.
3. For each line (Store or R&D), pick the **approved finished product batch** being packed, the **pack size** (quantity and unit, for example 200 ml) and the **number of packs**. The number of packs cannot use more than what is left of that batch.
4. Add the **packaging materials** used (material, quantity and unit). They are taken from their purchase batches oldest first.
5. Click **Save**, then **Yes, save** in the red box that asks once more. The issue and its materials are saved together, each line gets its own **PKG-** code, and the finished product and packaging material come off stock at once.

**Packing several pack sizes at once (Store/R&D):** after choosing Store or R&D, add one line for each pack size or batch (for example 200 ml × 50 and 1 ltr × 8 from the same batch), up to 30 lines in one save. Each line has its own packaging materials and gets its own packaging issue code. The Issue date and department are shared. The form shows the bulk product each line uses and what is left in each batch; if any line can't be saved, none are.

**Issuing several batches to Production at once:** choose Production and add one line per Finished Product batch, up to 30 lines in one save. Each line has the quantity to convert, the QC, Stability and (optionally) R&D quantities, and the sample unit. Each line becomes its own Raw Material (RM-FP) batch with its own QC and packaging issue code. A batch can be on one line only: if you repeat it, a red message appears under that line and Add line and Save stay greyed out until you fix it. Nothing is saved unless every line is valid.

**Fields you'll be asked for**
- **Department**: Store, R&D or Production.
- **Finished product batch**: only approved batches are offered.
- **Pack size and number of packs**: capped at what is left of the batch.
- **Packaging materials**: material, quantity and unit for each line.

**How it connects to the rest of the app**
Packaging uses the same stock the Inventory Ledger tracks: an issue here shows there as an outgoing movement. For a finished batch it's the last step before it leaves Atharva, apart from the certificate and labels that go with it.

**Voiding an issue made by mistake** (Inventory Manager or System Admin)
1. On the Packaging list, click **Void** in the issue's Status column.
2. A red box lists what goes back: the bulk to its batch, each packaging material to the batches it came from, and the packs taken off Packaged Finished Product stock.
3. Give a reason (at least 3 characters) and click **Yes, void**. Nothing is deleted: the stock goes back through new ledger rows, and the issue stays on the list struck through, with a **Void** badge, the date, who voided it and why.
4. A Production issue can be voided only while its RM-FP batch hasn't been used in a finished product batch or written off. Its RM-FP batch then leaves stock and its QC record is marked Void.

**Good to know**
- You can't issue more than a batch has available; the form stops you before stock goes negative. When a batch or packaging material is short, a red "Not enough stock for …" message names the line and shows what's available against what you asked for. The quantity box turns red, and Add line and Save stay greyed out until it's fixed.
- There is no repack or unpack: every issue is a pack.
- **Retest blocks packing.** A finished product batch cannot be packed while it is expired, past its retest date, or while a retest of it is open on the Quality Control page. The form says why. When the retest is approved the batch can be packed again; a rejected retest takes the remaining bulk out of stock (packs already made stay). Samples taken for a retest come off the bulk, so they reduce what is left to pack.
- The Packaging list has a Packing Register PDF for printing.

## Admin

### User Roles & Access

**Where to find it:** Admin → User Roles & Access

**Who can use it:** Only System Admins see the management tools: creating accounts, resetting passwords, changing roles and disabling accounts. Anyone else who opens the page sees "Access restricted".

**What it's for:** A System Admin controls here who can sign in and what each person may do: creating accounts (nobody can register themselves), assigning one or more of the six roles (Inventory Manager, System Admin, Super Auditor, Quality Checker, QC Reviewer, MFR Manager), resetting a forgotten password and disabling the account of someone who leaves. A person's roles decide which Add and Edit buttons and forms they see in every module.

**How to add a new person**
1. As a System Admin, go to User Roles & Access and use the add-user form: enter the person's name, their sign-in email and a temporary password (at least 10 characters).
2. Save. The screen shows the email and temporary password once; give them to the person privately. They are asked to choose their own password the first time they sign in.
3. Tick the roles the person needs and save (see below).

**How to change someone's roles**
1. You'll see a list of every user, one row each, with a set of six checkboxes showing their current roles.
2. Tick or untick roles for the person you want to change.
3. Click Save on that person's row. The change applies at once. Saving replaces all of that person's roles with the boxes ticked now, so if you tick only one box, their other roles are removed.

**Automatic sign-out.** The card above the user list sets how long a person can be inactive before Invento signs them out: tick the box and enter 5 to 480 minutes (60 by default), or untick it to switch the sign-out off. It applies to every role except System Admin.

**Change name:** each person's row has a **Change name** button (System Admin only). Names are at most 100 characters and no two people can share one (capitals and extra spaces are ignored).

**Other actions on a person's row:** **Reset password** sets a new temporary password they must change at their next sign-in. **Disable account** signs them out and stops them signing in; **Enable** switches the account back on. Both ask you to confirm.

**Fields you'll be asked for**
- **Role checkboxes**: Inventory Manager, System Admin, Super Auditor, Quality Checker, QC Reviewer, MFR Manager. A person can hold any combination, including none.

**How it connects to the rest of the app**
Every "Add," "Edit," and "Delete" control throughout Invento checks the roles assigned here before showing itself. Changing someone's roles on this screen immediately changes what they can do everywhere else, without them needing to log out and back in.

**Good to know**
- People are listed by name, not email. Make sure you recognise the display name before changing someone's access.
- You cannot remove your own System Admin role, and you cannot disable your own account; the last remaining System Admin can never be removed or disabled. Ask another System Admin if you need that done.
- Saving a row replaces all of that person's roles; you can't add one role without the others being ticked too. Check every box before saving.

### Reports

**Where to find it:** Reports & checks → Reports

**Who can use it:** Every signed-in user can view and export reports. The screen is read-only, so it needs no particular role.

**What it's for:** The four registers Atharva needs for day-to-day tracking and audits: raw material stock, QC history, finished product history and purchases. Each is a searchable table you can filter by date and download as Excel or PDF.

**How to pull a report and export it as a PDF**
1. Go to Reports & checks → Reports.
2. Scroll to the report card you need: **RM Stock Report**, **QC Register**, **FP Register**, or **Purchase Register**.
3. Optionally, narrow it down using the **From** / **To** date fields on that card (see below for which date each one filters on).
4. Use the table's built-in search to find specific rows on screen, and click a column heading (where it shows the up/down mark) to sort.
5. Click **Download Excel** or **Download PDF** to export the rows that pass your date filter. The search box only narrows what you see on screen; it does not change what is downloaded.

**Fields you'll be asked for**
- **From / To (date range)**: appears on every report card. Each report filters by a different underlying date, since each has a different natural "event date":
  - RM Stock Report filters by the date the item was added.
  - QC Register filters by the date the QC result was reviewed.
  - FP Register filters by the finished batch's finish date.
  - Purchase Register filters by the date the purchase was received.

**How it connects to the rest of the app**
Every report reads live from other modules: RM Stock Report from Item Master and current stock, QC Register from Quality Control, FP Register from Finished Product, and Purchase Register from Purchase and Vendor Master. You don't create or edit anything here. If a number looks wrong, correct it in the source module and the report follows.

**Good to know**
- The date filter narrows the rows already on screen; it doesn't run a new search, so applying and clearing it is instant.
- The downloads follow the date filter but not the search box, so set the date range first if you want a narrower export.
- Download PDF gives a printable table with the letterhead. Lists with more than 7 columns print sideways on A4 so codes and quantities stay on one line. The rupee sign and letters with marks (for example Brahmī) print correctly, and Hindi names print too, without joined letter forms. A PDF holds up to 3,000 rows (about 80 pages); for a longer list the app asks you to narrow it (a date range or the search box) or use Download Excel. Download Excel gives a spreadsheet with real numbers and dates, so you can sort and total them.
- The RM Stock Report shows **On Hand** and **Usable Now** (approved, in date, not due for retest) side by side. Its flag says "Below threshold" when the usable stock is under the item's low stock threshold. It shows current stock only; for stock on a past date use the Stock Statement tab in the Inventory Ledger.
- The Purchase Register lists submitted purchase lines only (drafts are not stock yet), with the unit and the quantity still remaining. The QC Register has a Type column (Purchased RM, Production RM or Finished product), the expiry date, and the retest date of each decision.
- Batches loaded through Opening Stock show a Legacy tag on screen and a Source column in the downloads.
- QC Register and FP Register are full history logs and show every row, including old and inactive ones. The Vendor, Equipment and Dead Stock lists, by contrast, hide inactive records until you tick Show inactive.

### Tester Feedback

**Where to find it:** Admin → Tester Feedback

**Who can use it:** Any signed-in user can submit feedback from any page. Only System Admins can review and respond (category, status and notes); anyone else who opens Admin → Tester Feedback sees that it needs System Admin access.

**What it's for:** Report bugs, confusing screens or suggestions from the page where you noticed them, without leaving the app. Each submission gets a ticket number (like FB-0007) so it can be tracked, and a System Admin can sort it and leave a note the person who sent it will see.

**How to submit feedback from any page**
1. On any screen, scroll to the bottom and click **Feedback & change log** to open it.
2. Type what you noticed (a bug, something confusing or a suggestion) in the box, in at least a few words.
3. Click **Submit**. You'll see a confirmation and your new ticket appear in the list below, with a ticket number.
4. As long as your ticket hasn't been reviewed yet ("Awaiting review"), you can click **Edit** to fix the wording or **Delete** to retract it. Once a System Admin has categorized or responded to it, it becomes read-only for you.

**Fields you'll be asked for**
- **Observation** (anyone): what you saw, in plain text. It's the only field a regular user fills in.
- **Category** (System Admin, when sorting): Bug, Enhancement, Invalid request, User education, Duplicate or Other.
- **Status** (System Admin, when sorting): Awaiting review, Awaiting implementation, Implemented or Rejected. The sender sees this as the ticket's state.
- **Notes** (System Admin, when sorting): a short note explaining the decision, for example why something was rejected or what changed. The sender can see it.

**How it connects to the rest of the app**
The feedback box is at the bottom of every page, and each submission records the page it came from, so a System Admin in Admin → Tester Feedback can see which screen each report is about. Nothing else in the app reads this data; it's a log for reporting and sorting.

**Good to know**
- A System Admin triaging feedback can filter the list by status using the tabs at the top of the Tester Feedback screen (All, Awaiting review, Awaiting implementation, Implemented, Rejected).
- Ticket numbers (FB-0001, FB-0002, …) are assigned automatically in order and are the easiest way to refer to a specific piece of feedback in conversation.
- Purge Test Data (see below) never deletes Tester Feedback tickets, so your submissions survive a full test-data wipe.

### Bulk Data Upload

**Where to find it:** Admin → Bulk Data Upload

**Who can use it:** Anyone, but you see a module's card only if you can add or edit in that module on its own screen; the same permissions control bulk upload. If you can't write to any module, you see a "no access" message.

**What it's for:** Load many records at once from an Excel file instead of one at a time. It covers eight areas: Item Master, Vendor Master, Item Type Master, MFR, Purchase, Instrument / Equipment Master, Dead Stock Register and Certificate of Analysis (COA) Templates. Each works the same way: download a blank template, fill it in and upload it.

**How to bulk-upload records**
1. Go to Bulk Data Upload. You'll see one card for each area you have access to.
2. On the card for the area you want, click **Download template**. The Excel file has an Instructions sheet with the rules, a data sheet with one example row to copy, and, for most modules, a Reference sheet listing the valid values (such as active item codes or vendor names) so you don't have to guess spellings.
3. Fill in your rows in the data sheet, following the example row's format. Required columns are marked with an asterisk.
4. Come back to the card, choose your filled-in file, and click Upload.
5. If every row is valid, they are all imported and a message gives the count. If any row has a problem, nothing is imported, and you get a list of every row to fix before you try again.

**Fields you'll be asked for**
- **Item, vendor, equipment and purchase order codes**: leave them out of your file. The app assigns them on import, as it does when you create a record by hand.
- **MFR and Purchase files**: these have multiple rows belonging to one record (e.g. several ingredient lines for one MFR, or several purchase lines for one invoice). Repeat the same MFR Name (for MFR) or the same Vendor Name + Invoice Number (for Purchase) on every row that belongs together.
- **COA Templates**: one row per Test and Specification, grouped by repeating the same Code (raw material item code or MFR code). A code that already has a template is refused; edit it on the item or MFR page instead.

**How it connects to the rest of the app**
An upload follows the same rules as adding a record by hand on that module's screen, and the records appear in the same places: an uploaded item in Item Master, an uploaded purchase order in Purchase as a Draft, and so on.

**Good to know**
- A file can have up to 500 data rows and 800 KB. Split a larger set into several files and upload them one after another.
- A Purchase file needs the QC, Stability and R&D quantities, Unit Price and GST % on every line (0 is allowed), only active vendors are accepted, and the invoice date cannot be in the future.
- An uploaded purchase order arrives as a Draft, like one entered by hand. Someone must open it and click Submit order before it changes stock.
- An uploaded MFR still needs someone to click Approve before it creates a usable Finished Product item.
- If a file is refused, fix the listed rows and upload the whole file again. Nothing is imported partly, and the valid rows aren't kept.

### Opening Stock

**Where to find it:** Admin → Opening Stock

**Who can use it:** Anyone with a role can load opening stock while loading is **open**. Only the System Administrator can close loading, re-open it, or undo a load.

**What it's for:** Before go-live, the stock already on the shelves is loaded from the physical stock count sheet, so the app starts with the right quantities. Raw material, packaging and finished product (packed and bulk) are loaded here. The System Administrator closes loading by hand after the agreed cut-off date. The app keeps no cut-off date of its own.

**Two ways to enter the stock.** Each card has two tabs: **Upload Excel** and **Type it in**. Both end in the same checks and the same all-or-nothing load, so use whichever suits the amount of stock.

**How to load from an Excel file**
1. Open the card for Raw Material, Packaging or Finished Product and click "Download template". Fill one row per batch (or lot) from the stock count sheet.
2. Choose the file and click "Check file". Every problem is listed with its Excel row number. Nothing is loaded while any problem remains.
3. For Raw Material and Packaging, the check also shows a short summary for each item: how many batches and the total quantity it will load. Compare it with your stock sheet before you load.
4. When the check says the file is fine, click "Load N rows". All rows are loaded together or not at all, and the load gets a number (OPN-0001, OPN-0002, …).

The **Loads** table at the bottom of the page lists every load with its number, type, rows, QC status counts, the date and time, and **who loaded it**.

**How to type the rows in**
1. Open the card and click the **Type it in** tab. Each batch (or lot) is one row card. Pick the item from the list (typing narrows it); the unit fills in from the item and can be changed.
2. For Raw Material, choose the QC status first. Only the fields that status needs are shown: an Approved batch asks for the old AR number, QC approval date, retest date and retests already done; a Rejected batch asks for the old AR number and approval date; a Pending QC batch asks for neither.
3. Use **Add row** for the next batch, **Duplicate** to copy a row (the batch number and AR number are left empty, because those cannot repeat) and **Remove** to drop one. Empty rows are ignored.
4. Click **Check rows**. Problems appear inside the row they belong to, with nothing loaded. When the rows are fine, click **Load N rows**. Changing anything after a check hides the Load button until you check again.
5. Up to 500 rows can be loaded at once. After a load the page clears so the next group can be typed.

**Unit column (Raw Material and Packaging).** Every row must say which unit its quantity is counted in. If that is a different unit from the one the item is kept in but of the same kind (for example g for an item kept in kg), the quantity is converted for you; if it cannot be converted, the row is refused. An older file without the Unit column is refused, so download the current template.

**Raw material rows** are Approved, Pending QC or Rejected. Approved and Rejected rows carry the old Analytical Report (AR) number exactly as written in the old records, plus the QC approval date. Approved rows also carry the retest date and the manufacturer expiry date. Pending QC rows only need the expiry date and join the normal QC queue. "Retests already done" (0 to 3) counts toward the limit of 3 retests.

**Finished product rows** carry one row per batch: Product Code, Batch No, manufacture date, expiry date, the old AR number and the QC approval date (finished product loaded here is always Approved). Fill "Bulk quantity unpacked" (in the product's own unit), or "Packs in stock" with "Pack size" (for example `100 ml`), or both. The pack size must be in the same family as the product's unit (ml with ltr, g with kg). The batch's total yield is the bulk plus packs × pack size. Packs are recorded as one Store packaging entry dated at the approval date, so they appear in Packaging and can be labelled or issued like any other packs. The bulk stays on the batch and can still be packed later. Two optional columns carry the retest cycle: "Retest date" (after the approval date, not after the expiry date) and "Retests already done" (0 to 3, counted toward the limit of 3; with 3 done leave the retest date blank). A product must have an approved MFR before its stock can be loaded.

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

> **Warning: this permanently deletes real data, with no undo in the app.** Purge Test Data deletes nearly every business record in Invento: every item, vendor, item type, MFR recipe, purchase order, quality check, finished product batch, BMR record, packaging issue, equipment entry, dead-stock entry and inventory ledger transaction, including all legacy (LEG-) data. You can't reverse it from the app. Use it only to reset the system to blank for testing, and never without a backup you can restore.

**What it's for:** Start testing from a completely empty system (no items, purchase orders, QC history or production records) without deleting everything by hand. It's for setting up end-to-end test runs, not for routine clean-up or fixing one mistake.

**How to purge test data**
1. Go to Admin → Purge Test Data (requires System Admin access).
2. Read the warning at the top of the page. It reminds you to take a backup first if you might still need anything.
3. Click **"Purge test data…"** to reveal the confirmation form.
4. Read the detailed warning that appears, listing everything that will be deleted.
5. In the confirmation box, type **PURGE ALL DATA** exactly. The purge button stays off until it matches.
6. Click **"Purge everything."** The button shows "Purging…" while it runs.
7. When it finishes, a summary shows how many rows were removed from each table, and the total.

**Fields you'll be asked for**
- **Confirmation phrase**: type `PURGE ALL DATA` exactly (same spacing and capitals) before the delete button works. It's a safety check against an accidental click, not a password.

**How it connects to the rest of the app**
A purge clears data in nearly every module at once: Item Master, Vendor Master, Purchase, Quality Control, Finished Product, MFR, Packaging, Equipment and the Dead Stock Register are empty afterwards, and the Dashboard and Reports show zero records. Numbering for items, purchase orders, AR numbers, MFR recipes, equipment and dead-stock entries also resets, so the next record of each type starts again at -0001.

**Good to know**
- **This cannot be undone from inside the app**: there is no recycle bin or restore button. Take a backup before you click it if there's anything you might need later.
- Accounts, every user's roles and all Tester Feedback tickets are kept; the purge clears business and inventory data only.
- Only System Admins can even see this button in an active state; everyone else is blocked at the page level.
- Because numbering restarts at -0001, use a purge only for a full testing reset, not to remove one bad entry. For that, edit or delete the record in its own module.

### Stock Integrity Check

**Where to find it:** Reports & checks → Stock Integrity Check

**Who can use it:** System Admin only. Anyone else who opens the page sees an access-restricted message.

**What it's for:** Invento keeps stock in two places: the inventory ledger (how much of each item there is) and the quantity left on each batch. Every receipt, issue, write-off, rejection and undo has to change both. This screen compares them. It runs nine read-only checks: an item's On hand against the parts on Stock Position, each purchase batch and each production-issued batch against the ledger, negative stock, purchase lines that are not submitted but have stock, ledger rows with the wrong unit or item, finished product stock against the bulk left on approved batches, duplicate batch numbers, and orphan records. It never changes data.

**How to use it**
1. Open Reports & checks → Stock Integrity Check. The checks run every time the page opens; reload to run them again.
2. A green banner means every check passed. A red banner lists how many differences were found. Each failing check says what it compares and what a difference means, and shows the first 20 rows. Every row starts with a sentence saying what is wrong, then the item, batch numbers, date and figures involved.
3. If anything fails, do not correct stock by hand. Note the rows and tell the developer.

The page also shows the number of rows in the inventory ledger. The stock reports read the whole ledger, so they slow down as it grows; the page warns when it approaches 3 million rows, which is when a closing-balance table should be planned.

### Legacy / deprecated modules

These modules were part of Invento at one point but are no longer expected to be used. They're kept under Admin, marked "- Deprecated," so their historical entries stay available for reference without cluttering the main workflow. There's no plan to develop them further.

**Batch Mfg. Record- Deprecated** (Archive → Batch Mfg. Record- Deprecated, System Admin only): the original Batch Manufacturing Record workflow (weighment lines, in-process observations, sign-off) for a production run. The current MFR and Finished Product flow above replaced it. Existing records stay visible for reference.

**Line Clearance- Deprecated** (Archive → Line Clearance- Deprecated, System Admin only): a pre-production check that a production line was clean and ready (an Area, an optional batch reference and a Clear / Not clear result). Existing entries stay visible for reference; new entries aren't expected.

**Environmental Control- Deprecated** (Archive → Environmental Control- Deprecated, System Admin only): Temperature and Humidity readings for an Area. Readings were recorded as entered, with no out-of-range alert or pass/fail check. Existing readings stay visible for reference.

## Glossary

**AR (Assign Record) / Analytical Report No.**: a Quality Control record, one per batch assigned for testing; on screen its number is called the Analytical Report No. Numbered `ARRM-0001/26` for raw material and `ARFP-0001/26` for finished product (a 4-digit running number per type, then the year; each type starts again at 0001 every year, and after 9999 it continues as 10000). Numbers issued before 3 Oct 2026 keep the old form, for example `AR-001-22092026`.

**Batch**: a specific received lot of a raw material or packaging item (from one Purchase line), or a specific production run of a finished product. Every batch has its own batch number and its own QC/stock history, even if it's the same item as another batch.

**COA (Certificate of Analysis)**: the official document certifying that a batch meets its specifications, generated from QC-approved test results. Numbered like `COA-0001-2026`.

**Draft**: the editable starting state of a Purchase Order or MFR before it's submitted/approved. Nothing in a Draft affects stock or production until it's finalized.

**Expiry date**: the date after which a batch must not be used. It is set by the QC Reviewer at every approval (it cannot be before today) and an expired batch is blocked from use and from retesting.

**FIFO (first-in, first-out)**: the rule Invento applies when it takes raw material for a finished product batch: the oldest QC-approved stock is used first, automatically, and may be drawn from several batches.

**Item code prefixes**: every item, vendor, and other master-data record gets an automatic code so you never have to invent or type one yourself:
- `RM-####`: raw material item
- `PKG-####`: packaging item
- `FP-####`: finished product item (created automatically when an MFR is approved)
- `V-####`: vendor
- `MFR-####`: MFR (recipe) record
- `PO-####`: purchase order
- `EQ-####`: equipment/instrument
- `DS-####`: dead stock register entry
- `FB-####`: Tester Feedback ticket
- `LEG-…`: a record imported from the legacy (pre-Invento) system, rather than created in the app
- `OPN-####`: an Opening Stock load
- `ARRM-####/YY` and `ARFP-####/YY`: Analytical Report Nos. for raw material and finished product

**Legacy**: stock that was loaded through Opening Stock from the old records instead of being received and tested in Invento. Its batch and AR numbers are kept as they were written, and a grey "Legacy" tag shows beside them. The "Hide legacy data" switch and the Source filter (All / New / Legacy) on some lists use it.

**MFR (Manufacturing Formula Record)**: the approved recipe for a finished product: which raw materials, in what quantities, make one batch.

**QC two-round review**: the mandatory Quality Control process every batch goes through: Round 1 (Quality Checker) and Round 2 (QC Reviewer), performed by two different people, both of whom must approve before the batch is usable.

**Retest**: a scheduled re-check of a batch after its Retest Period, using the stability sample set aside at Purchase. A batch overdue for retest is treated like one not yet approved: it can't be used until it passes the retest.

**On hand / Usable / Not usable**: On hand is all the stock of an item in the ledger. For raw material, **Usable** is the part that production may use today (QC approved, not expired, not due for retest); **Not usable** is the rest, shown with the reason (awaiting QC, retest due, expired). Low stock alerts compare the threshold with Usable.

**Role**: one of six permission groups (Inventory Manager, System Admin, Super Auditor, Quality Checker, QC Reviewer, MFR Manager) assigned per person on User Roles & Access; a person can hold several at once. See [What your role lets you do](#what-your-role-lets-you-do).

**Short batch number**: the short form of a finished product batch number, such as PR-01/26 (domestic) or OR-01/26 (export), shown beside the full number (FP-00001-01/26) on screens and used alone on printed documents and Reports.

**Submit order (formerly Final Submit)**: the action that turns a Draft purchase order into a real, stock-affecting record. Before submission, nothing on the order is visible anywhere else in the app.

## FAQ & troubleshooting

**I can't find an "Add" or "New" button on a screen I should be able to write to.**
Your role(s) probably don't allow changes in that module. Check [What your role lets you do](#what-your-role-lets-you-do), or ask a System Admin to check your roles on User Roles & Access. Viewing is open to everyone; adding and editing depend on your role in each module.

**A batch I expect to see isn't showing up in a picker (e.g. when building a Finished Product batch, generating a COA, or printing a label).**
This is almost always a Quality Control status issue. The batch must be fully **Approved** (both QC rounds), not expired and not currently overdue for retest to appear in most downstream pickers. Check its status on the Quality Control screen first.

**I submitted a purchase order by mistake and need to fix a line.**
Only a System Admin can reopen a submitted purchase order; reopening reverses the stock it added and unlocks the lines. Ask a System Admin to use **Reopen** on the order's page. It's refused if QC has started on any batch of the order, a batch has been used or written off, or a batch was rejected; the order then stays as it is.

**I made a mistake on a line in a Draft purchase order.**
You can't change the item, batch number or unit on a saved line. Delete the line and add it again, while the order is a Draft. Once it's submitted, a System Admin must reopen it first.

**I was signed out while I was away from my desk.**
Invento signs you out after a period without activity (60 minutes unless your System Admin has changed it); anything not saved is lost. System Admins are not signed out this way. Sign in again and re-enter the unsaved work.

**The stock shows quantity on hand, but I can't use it.**
On hand includes material that production may not use. Open Inventory Ledger → Stock Position and look at the Usable and Not usable columns: material waiting for QC, due for retest or expired is Not usable. Rejected raw material is taken out of On hand and listed under Rejected Materials.

**It says "Someone else changed this record while you were editing it."**
Someone saved the same item, vendor or purchase order details before you did, and nothing of yours was saved. Reload the page, look at their change, then make your edit again.

**My bulk upload file was rejected.**
Nothing is imported if any row has a problem. The error list shows which rows and what's wrong. Fix those rows and upload the whole file again; nothing is imported partly or corrected automatically.

**I need to update an existing COA test template but bulk upload rejected it.**
Bulk upload only accepts items/MFRs that don't already have a template. To change an existing template, open the item or MFR page and use Edit on its COA template card.

**Something looks wrong on the Dashboard or a Report.**
Both read live from the same data as every other screen; there's no separate reporting copy to fix. Correct the record in its source module (Item Master, Purchase, QC and so on), and the Dashboard and Reports follow.

**I noticed a bug or something confusing and want to report it.**
Scroll to the bottom of the page you're on and use the **Feedback & change log** box. It records the page you were on and gives you a ticket number. See [Tester Feedback](#tester-feedback).

**Who can I ask if I'm stuck on something not covered here?**
Ask your System Admin first about access and permissions. For how a screen behaves, use the Feedback box on that screen; a System Admin reads it, and it's also how this guide gets updated.

## How this guide stays current

This guide is kept up to date with the app, from the same sources the developers use (`docs/modules/*.md` and `docs/DESIGN.md` in the Invento code). Its "Where to find it", "Who can use it" and step-by-step instructions are checked against the current screens and permissions.

When Invento's screens, menus or roles change in a way that affects how you use it, this guide is updated and a new PDF is published at the same link in the app (Overview → User Guide). The same page shows the guide's text, opens at the right section from each screen's **Help** link, and holds the **Process Map**: diagrams of the flows in this guide, on screen or as a PDF. The link you have always gives the latest edition. The version note at the top shows when it was last updated.

If this guide is out of date, wrong or missing something, say so in the **Feedback & change log** box at the bottom of any page (see [Tester Feedback](#tester-feedback)). That's the fastest way to get it corrected in the next update.
