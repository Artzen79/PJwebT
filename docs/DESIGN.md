# DESIGN.md — Purple Glass Game UI

Design spec reverse-engineered from 7 in-game screenshots (FiveM server UI): All Menu (Home, Events, Battle Pass, Redeem), Inventory, Financial Center, and the farming HUD.
Colors and sizes are sampled from screenshots, so treat them as close approximations, not exact brand values.

**Mood:** night-time, premium, playful. Translucent violet glass panels float over the game world. Lavender outlines. Near-black inset wells. **Gold** marks what is active or what you can act on. Chunky uppercase type with big countdown numbers.

---

## 1. Design tokens

```css
:root {
  /* surfaces */
  --frame-outer:   #0d0a14;                 /* thick dark outline around every window */
  --panel:         rgba(60, 45, 98, 0.86);  /* main glass panel over the game world */
  --panel-solid:   #3b2d5e;
  --card:          #4a3a78;                 /* cards, buttons, tiles */
  --card-hi:       #574591;                 /* card hover / top of gradient */
  --well:          #16111f;                 /* inset: inputs, tracks, chips, table body */
  --well-2:        #1f1830;                 /* chips on top of cards */
  --line:          #8f7fe0;                 /* lavender border on cards and frames */
  --line-soft:     rgba(143, 127, 224, 0.35);

  /* text */
  --text:          #ffffff;
  --text-2:        #c9c0e6;                 /* secondary */
  --text-muted:    #8c82aa;                 /* labels, meta */

  /* accents */
  --gold:          #f5c542;                 /* active tab, highlighted time, tier, primary button */
  --gold-2:        #e9a93a;                 /* gradient end / button shadow edge */
  --gold-ink:      #2b1d05;                 /* text on gold */
  --amber:         #f5a524;                 /* progress fill start */
  --amber-hi:      #ffd36b;                 /* progress fill end */
  --green:         #7ac943;                 /* live, online, claimed, toggle on */
  --blue:          #4f7cf7;                 /* NEW / NEXT tags */
  --red:           #c0394f;                 /* stop / cancel action */
  --red-ink:       #ffd6dd;
  --violet:        #6a4fd8;                 /* icon disk fill */

  /* shape */
  --r-frame: 20px;  --r-card: 10px;  --r-tile: 8px;  --r-chip: 6px;  --r-pill: 999px;
  --border: 2px;

  /* depth */
  --shadow-frame: 0 0 0 4px var(--frame-outer), 0 12px 40px rgba(0,0,0,.55);
  --glow-gold:   0 0 12px rgba(245, 197, 66, .45);
  --glow-violet: 0 0 24px rgba(120, 90, 230, .35);
}
```

**Rules**
- Gold is reserved for the current or actionable thing: the active tab, the next round's time, the primary button, the current tier, the selected category. Never use gold for decoration.
- Green only means live, online, claimed or on. Red only means stop, cancel or close the current activity.
- Numbers that go over their cap turn amber (`21 | 20`). Counts within the cap stay white.

## 2. Typography

- **Font:** `Kanit` (Thai + Latin), with `Prompt` as fallback. Every heading uses weight 700–800.
- **Headings and labels are UPPERCASE in Latin.** Thai text stays as written.

| Role | Size / weight | Style | Example |
|---|---|---|---|
| Window title | 20–24 / 800 | uppercase, white | ALL MENU, INVENTORY, FINANCIAL CENTER |
| Hero name | 26 / 800 | uppercase | DEEP SEE |
| Card title | 14 / 700 | uppercase | AIRDROP EVENT |
| Nav tab | 12 / 700 | uppercase, tracking .06em, muted; active = gold | HOME EVENTS … |
| Micro label | 10 / 700 | uppercase, tracking .08em, `--text-muted` | STARTS IN, ENDS IN, ONLINE PLAYERS |
| Countdown / stat | 22–30 / 800 | `font-variant-numeric: tabular-nums` | 25:07, 1448 |
| Body / meta | 11–12 / 500 | `--text-2` or muted | รับสมัคร 5 นาที · เล่นทั้งหมด 60 นาที |
| Item name | 12 / 700 | centered, ellipsis on one line | Painkiller[CL] |

Separate meta parts with ` · `. Highlight the next time inside a time list in gold: `14:50 / 16:50 / 21:50 / **22:50** / 23:50`.

## 3. Window frame (every screen)

- Two outlines: an outer 4px `--frame-outer` and an inner 2px `--line`. Use `--r-frame` corners, `--panel` background and `backdrop-filter: blur(6px)`.
- **Top bar** sits inside the frame as a darker strip with `--r-card` corners:
  - **Left:** window title, with a greeting line under it (moon icon + `GOOD NIGHT, DEEP SEE`, name in white).
  - **Center:** nav tabs split around a **circular emblem**. The emblem is a dark disk with a logo, a dotted outer ring and a gold arc ring that shows progress. The active tab is gold with a 2px gold underline.
  - **Right:** clock chip (`well` background, icon + `Sun 22:34:52`), then 30×30 square icon buttons (settings, mail, close), each a `well` fill with a lavender border.
- Content padding is 16px and the gap between sections is 12–16px.

## 4. Components

### Icon badge
A circle (36–56px) with a 3px gold ring and a violet disk containing a white glyph. Used at the start of window titles (Inventory, Financial Center, Battle Pass, Redeem) and in table rows (small version, no ring).

### Section header
Row with a small muted icon and an UPPERCASE micro label on the left, and a right-aligned muted summary (`5 EVENTS · 1 LIVE`, `11 MENU`, `NORMAL 1/26 · PREMIUM 0/26`).

### Chips
- **Info chip:** `--well-2` background with `--r-chip` corners. Muted label then white value: `ID 1401` `JOB ประชาชน` `PHONE 267057`.
- **Status pill on images:** small rounded pill in the top-left corner of a card:
  - `LOCKED` — amber background, dark text, lock icon
  - `● NEXT` — blue background, white text
  - `● 23:00` — dark background, white text
- **Tag:** `NEW` in a blue pill. `+20 XP` / `+10 รอบนี้` in a gold-outline pill with gold text.
- **Key cap:** a gold square holding a dark letter, inline in text: `กด [J] เพื่อย้ายมิติ`.

### Buttons
| Variant | Look | Use |
|---|---|---|
| Primary (gold) | gradient `--gold`→`--gold-2`, dark text, 2px darker bottom edge, `--glow-gold` on hover | ยืนยัน, Pay All, ปลดล็อก PREMIUM |
| Secondary | `--well-2` fill, lavender border, white text with leading icon | Pay, time pill `⏱ 22:50 น.` |
| Quick launch | `--card` fill, 2px `--line` border, icon circle on the left, uppercase label, `›` on the right | GANG MANAGEMENT, RANKING … |
| Icon square | 30px, `well` fill, lavender border | header settings, mail, close |
| Danger round | 56–64px circle, `--red` fill with a dark ring, pink `X` | stop the farming activity |
| Carousel arrow | 28px dark circle with a chevron, overlapping the edge of the list | event carousel |

Disabled or done state uses a dark pill with muted text (`ปิดรับแล้ว`).

### Progress
- **Track:** `--well`, 6–8px tall, fully rounded.
- **Fill:** gradient `--amber`→`--amber-hi`.
- **Ring progress:** a gold or amber arc around an avatar or icon (profile avatar, farming icon, emblem).
- Pair every bar with a numeric value (`10/40`, `20 / 100 EXP`, `0/100`).

### Event card (carousel, 5 visible)
1. Banner art fills the top 45% of the card, with a status pill in the top-left corner.
2. Title in UPPERCASE.
3. Time list, with the next round in gold.
4. Muted meta line, plus a progress bar while registration is open.
5. Footer: micro label (`STARTS IN` / `ENDS IN`) above a big countdown, and a time pill or state pill on the right.

Card style: `--card` background, 2px `--line` border, `--r-card` corners. On hover, raise the card 2px and brighten the border.

### Announcement bar
A full-width `--well-2` strip with a round megaphone icon. Text reads `กิจกรรมถัดไป: ` followed by the event name and time in gold.

### Item tile (inventory, rewards)
- Square tile with `--r-tile` corners and a vertical gradient from `--card-hi` to `--card`. The image is centered at about 55% of the tile; the name sits at the bottom center.
- Top-left: favorite star (muted outline; gold when favorited), or a lock icon on locked rewards.
- Top-right: quantity, either `15 | 20` (count | stack max) or `x300`. The count turns amber when it is over the max.
- Corner badges: `NEW` (blue) or a green `+` square for money and usable items.
- Claimed reward: a green check circle in the top-left corner and a slightly brighter border.
- Grid: 7 columns with a 10px gap.

### Hotbar (inventory left rail)
A vertical stack of 7 circular slots (about 60px each), numbered underneath. A filled slot shows the item with a violet glow; an empty slot is a dark disk. A count badge sits in the top-right corner. Scroll chevrons at the bottom turn gold when active.

### Search and inputs
`--well` fill with a lavender border at 1px, rising to 2px gold on focus. A leading muted icon, placeholder `Search` or `ใส่โค้ดที่นี่`. The input is the same height as the button next to it.

### Table (Financial Center)
- Header row: uppercase micro labels.
- Each row is a `--well-2` card holding: an icon circle; a bold description with a muted `#1329904` under it; the amount in a dark pill; and a secondary `Pay` button.
- Footer: centered primary `Pay All`, and a `1 pending invoices` pill on the right.

### Timeline (Events tab)
- **Top:** a legend with a gold dot (รับสมัคร), a green dot (กำลังเล่น), a lighter tick (รอบต่อไป) and a dark dot (ผ่านไปแล้ว).
- **Axis:** 00:00–24:00 with a label every 3 hours.
- **Now marker:** a 2px vertical gold line across all rows, with a gold time chip (`22:36`) on the axis.
- **Each row:**
  - 72px thumbnail, then the name and a meta line (`6 รอบวันนี้ · ถัดไป 22:00 น.`)
  - A `--well` track with round segments: past segments in a dim purple, the live segment in green, upcoming rounds as thin light ticks
  - On the right, a countdown label and value

### Battle pass
- **Header card:** icon badge; title with the season meta (`SEASON 9 · จบ Thu Nov 19`); a tier box (gold outline, `TIER` micro label, big gold number); the EXP bar with the remaining amount on the right; and a gold `ปลดล็อก PREMIUM` button with a crown icon.
- **Left: Daily quest list.** Cards with a title, a description, a thin progress bar and a `+20 XP` pill. The list scrolls.
- **Right: rewards track.** Two rows (NORMAL / PREMIUM) labelled in a side column, with tier nodes on a line between them. The current node is a gold filled circle and the line up to it is gold. Other nodes are dark circles with white numbers. The track scrolls horizontally.

### HUD widgets (in-world, no dimming)
- **Activity pill:** a large rounded capsule with a ring-progress icon on the left; a title, `+10 รอบนี้` tag and status pill; a bar showing `ในกระเป๋า` with `10/40`; and the danger round button on the right.
- **Hint card:** a small capsule with an icon circle, a title, a key-cap hint and a dimension chip (`มิติ #1`, number in gold).
- **Status strip (bottom right):** parallelogram (skewed −12°) dark chips showing ID, date, time, mic and signal bars in gold. Above it sit role counters: round colored icons (gold, blue, red) with a number.

### Toggle
Pill switch: green track with a white knob when on, `--well` track when off. The label sits to the right (`รับมอบของ`).

## 5. Layout

- The main menu is a centered window about 1220×680 that leaves the game visible around it. Modals (Financial Center, Redeem) are smaller, centered windows in the same frame.
- Home flow from top to bottom:
  1. Profile row (avatar with ring progress, name, info chips) with the stat card on the right
  2. Events carousel
  3. Announcement bar
  4. Quick launch grid (5 columns, scrolls when there are more items)
- Inventory: rail of about 80px, then the grid. The header holds the category icon tabs and the search field.
- Spacing scale: 4 / 8 / 12 / 16 / 24.

## 6. Motion

Use subtle, quick motion (120–180ms ease-out):
- Hover lifts by 2px and brightens the border.
- Pressing a button scales it to 0.97.
- Tabs switch with a fade and a 6px slide.
- Countdowns tick every second without layout shift (tabular numbers).
- The emblem's gold arc and the ring progress animate their stroke.
- A live event gets a slow green pulse.
- Honor `prefers-reduced-motion`.

## 7. Accessibility

- Text on `--panel` must stay at 4.5:1 or higher; white and `--text-2` pass. Use `--text-muted` only for labels of 10px and up.
- Gold buttons carry dark text, never white.
- Never show state with color alone: pair it with a label or icon (LOCKED, ● NEXT, ✓ claimed, legend text).
- Every interactive element is at least 30×30 and has a visible gold focus ring (`outline: 2px solid var(--gold); outline-offset: 2px`).

## 8. Copy style

- Thai for sentences and states (`กำลังเก็บเกี่ยว`, `ปิดรับแล้ว`, `ยืนยัน`). Latin UPPERCASE for system labels and names.
- Times use 24h with `น.` (`22:50 น.`). Countdowns use `MM:SS`, or `HH:MM:SS` from 1 hour up. Money is `$12,000`. Quantities are `x300` or `15 | 20`.
