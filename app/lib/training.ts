import { isYoungKidView, type KidProfile } from "./schema";

/**
 * The in-app course. Three separate curricula, because the three readers want genuinely different
 * things from the same app:
 *
 * - A **parent** wants to know *why* a feature exists before they'll turn it on. Every parent lesson
 *   leads with the reasoning — the thing about money a kid learns from it — and only then says which
 *   buttons to press.
 * - A **teen** wants the mechanics, honestly and without being talked down to, with a picture that
 *   makes the shape of the idea obvious.
 * - A **little kid** can't read a paragraph. Their lessons are a picture and a handful of words,
 *   and the picture carries the meaning on its own.
 *
 * Content lives here rather than in the components so the same lesson can be reached from three
 * places — first-run, the Learn tab, and a "what is this?" link next to a feature — without any of
 * them owning it.
 */

export type Audience = "parent" | "teen" | "young";

/** Which SVG scene illustrates a lesson. Drawn in components/training-art.tsx. */
export type ArtKind =
  | "vault"
  | "payday"
  | "taxjar"
  | "goal"
  | "snowball"
  | "risk-ladder"
  | "waves"
  | "autopilot"
  | "streak"
  | "quest"
  | "approval"
  | "undo"
  | "buckets"
  | "keys";

export type Lesson = {
  id: string;
  emoji: string;
  title: string;
  /** One line under the title in the index — how a reader decides this is the one they want. */
  blurb: string;
  art: ArtKind;
  /** Words on screen. For "young" these are read aloud by a grown-up; keep each under ~8 words. */
  points: string[];
  /** Parent-only: the reason the feature exists, in the parent's terms. */
  why?: string;
  /** Parent-only: the actual steps, naming the real tabs. */
  how?: string[];
  /** Search terms beyond the title/blurb — what someone would actually type. */
  keywords?: string[];
};

const PARENT_LESSONS: Lesson[] = [
  {
    id: "parent-premise",
    emoji: "🏦",
    title: "You are the bank",
    blurb: "Why the money stays in your account and the app only keeps score.",
    art: "vault",
    why:
      "A kid learns almost nothing from a jar of cash — it gets spent, lost, or forgotten, and it can't earn interest. Here the real money stays in your account, and your kid gets what a bank actually gives an adult: a balance that goes up on its own, a statement, and the experience of watching a number grow because they left it alone. You keep the cash; they get the lesson.",
    how: [
      "Everything in the app is a claim on money you're already holding for them.",
      "🏦 Money → Reconciliation is where you check the app's total against what's really in your account.",
      "When a kid actually needs cash in hand, hand it over and record it there so the two stay in step.",
    ],
    points: [
      "The app is a ledger, not a wallet — no card, no transfers, no third party holding your money.",
      "Everything is stored encrypted on your own device.",
    ],
    keywords: ["bank", "real money", "cash", "reconcile", "premise"],
  },
  {
    id: "parent-allowance",
    emoji: "📅",
    title: "Allowance and payday",
    blurb: "A fixed day, every week, and why that matters more than the amount.",
    art: "payday",
    why:
      "The amount is almost irrelevant; the rhythm is the whole thing. Money that arrives on a known day is money a kid can plan around, and planning is the skill. An allowance that shows up when they ask for it teaches them to ask.",
    how: [
      "Each kid has a weekly amount and a payday, set in ⚙️ Settings → 👤 Profile.",
      "The app pays it automatically — you don't have to remember.",
      "Miss a few days offline? It catches up the moment you open the app.",
    ],
    points: ["Same day every week.", "Paid automatically, even for days the app wasn't open."],
    keywords: ["allowance", "payday", "weekly", "pay"],
  },
  {
    id: "parent-tax",
    emoji: "🫙",
    title: "The tax pot",
    blurb: "A small cut off every payday, and the conversation it starts.",
    art: "taxjar",
    why:
      "Nobody's first paycheque matches the number they were promised, and finding that out at sixteen is a bad time to find it out. A few percent skimmed off every allowance makes gross-versus-net a fact of life rather than a surprise. It's small enough not to sting and visible enough to ask about — and the question \"where does it go?\" is the one you want.",
    how: [
      "Set the rate in ⚙️ Settings → 📈 Family.",
      "The pot builds up under 🏦 Money → Tax Pots.",
      "It's yours to decide what it's for — a family fund, a holiday, giving it back at year end. Deciding out loud is the point.",
    ],
    points: ["Comes off the top, automatically.", "Visible to the kid, always."],
    keywords: ["tax", "pot", "gross", "net", "deduction"],
  },
  {
    id: "parent-goals",
    emoji: "🎯",
    title: "Goals, and spending less",
    blurb: "Why the app pushes a plan every time a kid asks for money.",
    art: "goal",
    why:
      "\"No\" teaches a kid that money is controlled by you. A plan teaches them that money is controlled by time. When a kid asks to spend, the app shows them the same amount as a goal instead — how many weeks it takes, and what a spend costs them in streak and interest. Some of the time they take the plan, and that choice is worth more than the thing they wanted.",
    how: [
      "A goal can take a slice of every payday automatically — set the weekly amount when you create it.",
      "When a kid taps Ask to spend, the alternative appears next to the request, with the real numbers.",
      "You still approve or deny under ✅ Approvals; nothing moves without you.",
    ],
    points: ["Every spend request offers a plan first.", "Goals fill themselves each payday."],
    keywords: ["goal", "saving", "spend", "plan", "approval"],
  },
  {
    id: "parent-invest",
    emoji: "📈",
    title: "The four ways to invest",
    blurb: "Savings, CD, stocks, crypto — what each one teaches, and who should see it.",
    art: "risk-ladder",
    why:
      "Risk is impossible to explain and easy to feel. Four options along a ladder — a savings account that only ever ticks up, a CD that pays more if you don't touch it, stocks that wobble, crypto that lurches — let a kid feel the trade-off with money that is genuinely theirs. The stock and crypto lines are driven by a real market simulation, so a bad week looks like a bad week.",
    how: [
      "Every option shows its rules, a simulation of what your money would do, and a confirmation before anything moves.",
      "You choose which kinds each kid can use: ⚙️ Settings → 👤 Profile, or the switches at the top of their 📈 Invest tab.",
      "A little kid starts with nothing switched on. Savings and CDs are the safe first yes; the other two carry a warning but are still your call.",
      "There's a minimum hold so investing isn't a slot machine — set it in ⚙️ Settings → 📈 Family.",
    ],
    points: ["Simulate first, confirm second.", "Per-kid switches — you decide what they can see money do."],
    keywords: ["invest", "stocks", "crypto", "cd", "savings", "risk", "unlock", "permission"],
  },
  {
    id: "parent-interest",
    emoji: "❄️",
    title: "How interest is actually paid",
    blurb: "What the rates mean and when the money lands.",
    art: "snowball",
    why:
      "Compounding is the one piece of money maths that feels like magic, and it only feels like magic if you can watch it happen. The app pays interest weekly rather than yearly so a kid sees movement often enough to connect it to leaving money alone.",
    how: [
      "You set the savings and CD rates yourself in ⚙️ Settings → 📈 Family — annual percentages, like a real bank quotes.",
      "The engine pays them weekly, at the annual rate divided by 52, compounding on the balance including what interest already added.",
      "Set them to whatever you can actually afford to honour. Generous rates teach the lesson faster, and you're the one paying.",
    ],
    points: ["Rates are annual; the app pays weekly at rate ÷ 52.", "Interest earns interest."],
    keywords: ["interest", "compound", "apr", "rate", "hysa", "weekly"],
  },
  {
    id: "parent-autoinvest",
    emoji: "🔁",
    title: "Standing orders",
    blurb: "Deciding once instead of every week.",
    art: "autopilot",
    why:
      "Every adult who is good with money got there by automating a decision they'd otherwise have to win every month. Letting a kid set that up themselves — and change it whenever they like — is the habit, not the amount.",
    how: [
      "The kid sets it on their 📈 Invest tab: an amount per payday, per kind.",
      "It runs after the goals take their slice, so a goal never gets starved by it.",
      "It can only point at kinds you've switched on for them.",
    ],
    points: ["Set once, runs every payday.", "The kid owns it — they can stop it any time."],
    keywords: ["auto", "automatic", "standing order", "recurring", "invest"],
  },
  {
    id: "parent-streaks",
    emoji: "🔥",
    title: "Streaks and the Dad Match",
    blurb: "Rewarding the weeks nothing happened.",
    art: "streak",
    why:
      "Saving is invisible — there's no moment of triumph in not spending, which is exactly why it's hard. A streak makes the not-spending visible, and a match at a milestone puts a number on it. It's the same trick as an employer matching a pension, learned twenty years early.",
    how: [
      "The streak counts weeks with no withdrawal, and resets when one goes through.",
      "Set milestones and match amounts in ⚙️ Settings → 📈 Family.",
      "When a kid asks to spend, the app tells them what the streak costs them — before they decide.",
    ],
    points: ["A visible reward for doing nothing.", "You choose the milestones."],
    keywords: ["streak", "match", "milestone", "bonus", "reward"],
  },
  {
    id: "parent-quests",
    emoji: "🗺️",
    title: "Quests",
    blurb: "Paid work, separate from allowance, on purpose.",
    art: "quest",
    why:
      "Allowance and earnings should feel different. Allowance is what you get for being part of the family; a quest is what you get for doing a job someone needed done. Keeping them separate is what lets a kid discover that they can change their income by choosing to.",
    how: [
      "Post a job with a reward under 🏦 Money → Quests.",
      "The kid claims it; you approve and pay when it's done, from ✅ Approvals.",
      "Post one that's worth real money occasionally — the point lands harder.",
    ],
    points: ["Work is optional; allowance isn't.", "You approve before anything is paid."],
    keywords: ["quest", "bounty", "chore", "job", "earn"],
  },
  {
    id: "parent-undo",
    emoji: "🧾",
    title: "Activity and Undo",
    blurb: "Every action, who did it, and a way back.",
    art: "undo",
    why:
      "You will tap the wrong kid's name. The whole system depends on the kid trusting the number, so a mistake has to be fixable in a way they can see — a quiet edit behind the scenes is worse than the mistake.",
    how: [
      "🧾 Activity lists everything either of you has done, newest first.",
      "Filter by month, year, or kid; page back through as far as you like.",
      "Anything reversible has an Undo button right on the row.",
    ],
    points: ["Nothing happens silently.", "Reversible things stay reversible."],
    keywords: ["activity", "undo", "log", "history", "audit", "mistake"],
  },
  {
    id: "parent-buckets",
    emoji: "🪣",
    title: "Where the money is",
    blurb: "Reading the buckets, and keeping the app honest.",
    art: "buckets",
    why:
      "A single balance hides the interesting part. Split the same money into spendable, committed to goals, and invested, and a kid can see the shape of their own decisions — and so can you, at a glance, without asking them anything.",
    how: [
      "The buckets bar sits on every kid's home screen.",
      "🏦 Money → Reconciliation compares the app's totals to your real account balance.",
      "Record cash you actually handed over there, so the two never drift apart.",
    ],
    points: ["Same money, split by what it's promised to.", "Reconcile now and then — it takes a minute."],
    keywords: ["buckets", "balance", "reconcile", "cash", "where"],
  },
  {
    id: "parent-security",
    emoji: "🔑",
    title: "Family Phrase, PINs and sync",
    blurb: "What protects the data, and what to do if a device is lost.",
    art: "keys",
    why:
      "This holds your family's money data, so it's encrypted on the device with a key derived from your Family Phrase — nobody else can read it, including us. That also means nobody can recover it for you. The trade-off is deliberate, and it's worth knowing which side of it you're on.",
    how: [
      "The Family Phrase is the key. Write it down somewhere real. Lose it and the data is gone.",
      "PINs are asked for every time the app opens or comes back. A parent can always get in with their own PIN, even on a kid's screen.",
      "Sync passes only encrypted blobs through a relay that can't read them — ⚙️ Settings → 🛠️ App.",
      "Export a backup now and then from the same place.",
    ],
    points: ["Encrypted with your phrase — unrecoverable without it.", "Back it up."],
    keywords: ["security", "pin", "phrase", "password", "sync", "backup", "encryption"],
  },
];

const TEEN_LESSONS: Lesson[] = [
  {
    id: "teen-balance",
    emoji: "🏦",
    title: "This is a real balance",
    blurb: "Whose money it is, and where it actually sits.",
    art: "vault",
    points: [
      "The money is yours. Your parent is holding it, the same way a bank holds an adult's.",
      "It earns interest, it can be invested, and you can ask for it.",
      "The difference from cash in a drawer: this grows while you're not looking.",
    ],
    keywords: ["balance", "bank", "money"],
  },
  {
    id: "teen-payday",
    emoji: "📅",
    title: "Payday and the tax pot",
    blurb: "Why what arrives is less than what was promised.",
    art: "taxjar",
    points: [
      "Allowance lands on the same day every week, automatically.",
      "A small slice comes off the top before you see it. That's tax — every adult's payslip works this way.",
      "What's left after tax, goals and standing orders is what you can actually spend today.",
    ],
    keywords: ["payday", "tax", "allowance", "net"],
  },
  {
    id: "teen-goals",
    emoji: "🎯",
    title: "Name it and it fills itself",
    blurb: "Goals, and why they beat willpower.",
    art: "goal",
    points: [
      "Set a goal and pick an amount to take off each payday. It fills without you thinking about it.",
      "The app shows the finish date, so \"someday\" turns into a date on a calendar.",
      "Money in a goal is still yours — it's just spoken for.",
    ],
    keywords: ["goal", "save", "target"],
  },
  {
    id: "teen-compound",
    emoji: "❄️",
    title: "Interest earns interest",
    blurb: "The snowball, with the actual numbers.",
    art: "snowball",
    points: [
      "Interest is paid weekly, at the yearly rate divided by 52.",
      "Next week's interest is worked out on the new, bigger balance — that's compounding.",
      "It looks like nothing for a month and like something real after a year. That gap is why most people never find out.",
    ],
    keywords: ["interest", "compound", "apr", "growth"],
  },
  {
    id: "teen-ladder",
    emoji: "🪜",
    title: "The risk ladder",
    blurb: "Four options, from can't-lose to wild.",
    art: "risk-ladder",
    points: [
      "🚲 Savings: small, steady, never goes down.",
      "🔒 CD: pays more, but your money is locked up for a set time.",
      "🚀 Stocks: follows the real market. Up over years, bumpy over weeks.",
      "🎢 Crypto: same idea, much wilder. Only ever with money you can watch fall.",
      "More reward always means more chance of loss. There is no fifth option where it doesn't.",
    ],
    keywords: ["risk", "invest", "stocks", "crypto", "cd", "savings", "ladder"],
  },
  {
    id: "teen-volatility",
    emoji: "🌊",
    title: "Down weeks are normal",
    blurb: "What a chart actually looks like, and when to do nothing.",
    art: "waves",
    points: [
      "A line that only goes up isn't investing — it's a savings account.",
      "The biggest cost of a bumpy investment isn't the drop. It's selling during one.",
      "There's a minimum hold before you can cash out. It's there to stop the panic sell.",
      "Before you put money in, run the simulation. It shows you the bad weeks too.",
    ],
    keywords: ["volatility", "drop", "crash", "loss", "chart", "hold"],
  },
  {
    id: "teen-auto",
    emoji: "🔁",
    title: "Decide once",
    blurb: "Standing orders, and why automating beats remembering.",
    art: "autopilot",
    points: [
      "Set an amount per payday and it goes in by itself, forever, until you change it.",
      "This is the single habit that separates adults who are good with money from adults who aren't.",
      "You can turn it off whenever you want. Most people never do — that's the trick.",
    ],
    keywords: ["auto", "automatic", "standing order", "invest"],
  },
  {
    id: "teen-streak",
    emoji: "🔥",
    title: "Streaks, and what a spend costs",
    blurb: "The price tag that isn't on the price tag.",
    art: "streak",
    points: [
      "Every week you don't withdraw adds to your streak. Milestones pay a bonus.",
      "A withdrawal resets it to zero — so the real cost of a $20 spend is $20 plus the streak.",
      "When you ask to spend, the app shows you both numbers. Then it's your call.",
    ],
    keywords: ["streak", "match", "bonus", "spend"],
  },
  {
    id: "teen-buckets",
    emoji: "🪣",
    title: "Where your money is",
    blurb: "Reading the buckets bar.",
    art: "buckets",
    points: [
      "Spendable is what you could use today.",
      "Goals is money you've already promised to something.",
      "Invested is money that's working. It isn't gone — but some of it can't come back today.",
    ],
    keywords: ["buckets", "balance", "spendable"],
  },
];

const YOUNG_LESSONS: Lesson[] = [
  {
    id: "young-money",
    emoji: "🪙",
    title: "This is your money",
    blurb: "Where your coins live.",
    art: "vault",
    points: ["This is YOUR money.", "Dad keeps it safe for you.", "The big number is how much you have!"],
  },
  {
    id: "young-payday",
    emoji: "📅",
    title: "Payday!",
    blurb: "More money, every week.",
    art: "payday",
    points: ["Every week you get more money.", "Same day, every week.", "Count the sleeps until payday!"],
  },
  {
    id: "young-grow",
    emoji: "🌱",
    title: "Money can grow",
    blurb: "Leave it alone and it gets bigger.",
    art: "snowball",
    points: ["Money you don't spend gets BIGGER.", "A little bit more, every week.", "Like a plant. Wait, and it grows."],
  },
  {
    id: "young-goal",
    emoji: "🎯",
    title: "Saving for something big",
    blurb: "Picking a thing and filling up the bar.",
    art: "goal",
    points: ["Want something big?", "Save a little bit each week.", "Watch the bar fill up!"],
  },
  {
    id: "young-quest",
    emoji: "🗺️",
    title: "Do a job, get paid",
    blurb: "Quests!",
    art: "quest",
    points: ["Dad puts jobs on the board.", "Do one and tap Claim!", "Then you get paid. 🎉"],
  },
  {
    id: "young-ask",
    emoji: "🙋",
    title: "Ask before you spend",
    blurb: "How to buy something.",
    art: "approval",
    points: ["Want to spend? Tap Ask Dad.", "Dad says yes or no.", "Or... save it and get something BIGGER!"],
  },
];

export const CURRICULA: Record<Audience, Lesson[]> = {
  parent: PARENT_LESSONS,
  teen: TEEN_LESSONS,
  young: YOUNG_LESSONS,
};

export const AUDIENCE_TITLES: Record<Audience, { title: string; subtitle: string }> = {
  parent: {
    title: "How this works, and why",
    subtitle: "Twelve short pieces on what each part of the app is for. Skip around — nothing depends on order.",
  },
  teen: {
    title: "How money works here",
    subtitle: "Nine short ones. Read them in any order.",
  },
  young: {
    title: "Let's learn about money!",
    subtitle: "Tap the arrow to see the next one.",
  },
};

export function audienceForKid(kid: KidProfile): Audience {
  return isYoungKidView(kid) ? "young" : "teen";
}

/** Free-text search over a curriculum, so "crypto" or "pin" lands on the right lesson immediately. */
export function searchLessons(audience: Audience, query: string): Lesson[] {
  const lessons = CURRICULA[audience];
  const needle = query.trim().toLowerCase();
  if (!needle) return lessons;
  return lessons.filter((lesson) =>
    [lesson.title, lesson.blurb, ...(lesson.keywords ?? []), ...lesson.points, lesson.why ?? "", ...(lesson.how ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function findLesson(audience: Audience, id: string): Lesson | undefined {
  return CURRICULA[audience].find((lesson) => lesson.id === id);
}
