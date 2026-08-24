# Setting it up

Three things have to happen: the workbook goes into SharePoint, an app registration gives the
page permission to reach it, and the page gets hosted somewhere a browser can load it.

Budget about half an hour. Steps 2 and 3 need someone with the **Application Developer** (or
Global Administrator) role in Entra ID, and step 3 option A needs a **SharePoint Administrator**.

---

## 1. Put the workbook in SharePoint

Upload `QMS-Document-Register.xlsx` to the document library where it should live — for example
the **Documents** library of your QMS site.

Note the path **relative to the library root**. This trips people up: Graph's default drive for
a site *is* that library, so a file sitting at `Documents/General/QMS-Document-Register.xlsx` in
the SharePoint UI is addressed as `General/QMS-Document-Register.xlsx`.

Two library settings will break writes if they are on — check them under
**Library settings → Versioning settings**:

- **Require documents to be checked out** must be **No**.
- **Require content approval** must be **No**.

Version history is fine, and worth keeping on: it gives you a rollback for the register.

---

## 2. Register the application in Entra ID

At [entra.microsoft.com](https://entra.microsoft.com) → **Applications → App registrations → New registration**:

| Field | Value |
|---|---|
| Name | `QMS Document Register` |
| Supported account types | **Accounts in this organizational directory only (single tenant)** |
| Redirect URI | Platform **Single-page application (SPA)** — the exact URL the page will be served from |

The redirect URI must match the final page URL character for character, including the file
name. If you don't know it yet, do step 3 first and come back. The page prints the value it
needs on its own settings screen.

> Choose the **Single-page application** platform, not **Web**. A SPA registration is what
> enables PKCE and the CORS headers on the token endpoint; a Web registration expects a client
> secret and will reject the page with `AADSTS9002326`.

Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page — you
will paste both into the page. Neither is a secret; a single-page app has no client secret and
publishes both in its sign-in URL by design.

Then **API permissions → Add a permission → Microsoft Graph → Delegated permissions**:

| Permission | Why |
|---|---|
| `User.Read` | Show who is signed in (added by default) |
| `Sites.Read.All` | Resolve the SharePoint site from its URL |
| `Files.ReadWrite.All` | Read and write the workbook |
| `offline_access` | Keep the session alive without re-prompting |

Click **Grant admin consent**. These are *delegated* permissions: the page acts as the person
using it and can only reach files that person could already open. Someone with no access to the
QMS site sees nothing.

---

## 3. Host the page

A browser has to load `index.html` from somewhere. Pick one.

### Option A — from the SharePoint document library

This is the "upload both files and be done" route. It works, with one condition: SharePoint
serves an `.html` file from a library as a *page* only on sites where **custom script** is
allowed, and Microsoft disables that by default.

A SharePoint administrator enables it for the one site, from the SharePoint Online Management
Shell:

```powershell
Connect-SPOService -Url https://<tenant>-admin.sharepoint.com
Set-SPOSite -Identity https://<tenant>.sharepoint.com/sites/QMS -DenyAddAndCustomizePages $false
```

Then upload `index.html` to the site's **Site Assets** library and open it directly:

```
https://<tenant>.sharepoint.com/sites/QMS/SiteAssets/index.html
```

That URL is the redirect URI for step 2.

Be aware of what this trades away. Allowing custom script on a site lets anyone who can upload
to it run script in other users' browsers there — that is precisely why it ships off. Turn it on
for a site whose contributors you'd already trust with that, not for a site open to the whole
organisation. Some tenants also re-apply the restriction on a schedule, in which case the page
stops loading until it is set again; if that happens to you, use option B.

### Option B — Azure Static Web Apps (recommended)

Free tier, HTTPS, no SharePoint setting to fight. Create a Static Web App, deploy the single
file, and use the assigned `https://<name>.azurestaticapps.net/index.html` as the redirect URI.
The workbook still lives in SharePoint; only the page moves.

### Option C — SharePoint Framework web part

The most native result: the register appears as a web part on a normal SharePoint page, and
SPFx supplies the Graph token so the sign-in code isn't needed at all. It costs a Node build
toolchain and a deployment pipeline. Worth it if this becomes a permanent internal tool.

---

## 4. Connect the page

Open the hosted page. On first load it asks for:

| Setting | Example |
|---|---|
| Directory (tenant) ID | `00000000-0000-0000-0000-000000000000` |
| Application (client) ID | `00000000-0000-0000-0000-000000000000` |
| SharePoint hostname | `contoso.sharepoint.com` |
| Site path | `/sites/QMS` |
| Workbook path | `General/QMS-Document-Register.xlsx` |
| Worksheet / table | `Register` / `DocumentRegister` |

These are stored in that browser's local storage. To hand everyone a pre-configured page
instead, fill in `BUILT_IN_CONFIG` at the top of the script in `index.html` before deploying.

Sign in, and the register loads.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| `AADSTS9002326` cross-origin token redemption | The redirect URI is registered under the **Web** platform. Move it to **Single-page application**. |
| `AADSTS50011` redirect URI mismatch | The registered URI doesn't match the address bar exactly. Compare them character by character, including the file name. |
| `403 Forbidden` from Graph | Admin consent wasn't granted for `Files.ReadWrite.All` / `Sites.Read.All`. |
| `404 itemNotFound` on load | The site path or workbook path is wrong. Remember the workbook path excludes the library name. |
| The `.html` file downloads instead of opening | Custom script is disabled on that site — step 3 option A, or move to option B. |
| "This row has moved in the workbook" | Someone inserted or deleted a row in Excel since the page loaded. Nothing was written. Refresh and redo the edit. |
| Saves fail while the file is open in Excel | Close it in the desktop app, or edit in Excel for the web, which co-authors happily alongside the page. |
| Dashboard sheet is blank | Open the workbook once in Excel; it computes and stores the formula results. |
