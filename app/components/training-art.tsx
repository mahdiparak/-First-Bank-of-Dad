"use client";

import type { ArtKind, Audience } from "@/lib/training";

/**
 * One hand-drawn SVG scene per lesson. No image files and no chart library — same as the rest of
 * this app — so the art is themeable, scales to any screen, and costs nothing to load.
 *
 * The scenes take an `audience` because a six-year-old and a parent need different pictures of the
 * same idea: the little-kid version is bigger, bolder, has no axis labels and no numbers to read,
 * and carries the whole meaning on its own, since the words underneath are being read aloud by
 * someone else. Colours come from the asset-class palette already used by every chart in the app,
 * so "blue means savings" holds true here too.
 */

const PALETTE = {
  savings: "var(--asset-savings)",
  cd: "var(--asset-cd)",
  stocks: "var(--asset-stocks)",
  crypto: "var(--asset-crypto)",
};

export function TrainingArt({ kind, audience }: { kind: ArtKind; audience: Audience }) {
  const young = audience === "young";
  return (
    <div
      className={`w-full overflow-hidden rounded-2xl ${
        young ? "bg-black/[0.03] p-2 dark:bg-white/[0.06]" : "bg-black/[0.02] p-1 dark:bg-white/[0.04]"
      }`}
    >
      <svg
        viewBox="0 0 320 180"
        className="h-auto w-full"
        role="img"
        aria-label={ART_LABELS[kind]}
        style={{ maxHeight: young ? 260 : 200 }}
      >
        <Scene kind={kind} young={young} />
      </svg>
    </div>
  );
}

const ART_LABELS: Record<ArtKind, string> = {
  vault: "A safe holding a pile of coins",
  payday: "A week of days with a coin landing on payday",
  taxjar: "A coin splitting, most going to a wallet and a slice to a jar",
  goal: "A progress bar filling toward a prize",
  snowball: "A small ball of money rolling downhill and growing",
  "risk-ladder": "Four steps rising from a steady line to a jagged one",
  waves: "A line that dips and recovers, ending higher than it started",
  autopilot: "Repeating arrows moving coins on their own each week",
  streak: "A row of flames, one per week, with a bonus at the end",
  quest: "A job posted on a board with a reward tag",
  approval: "A request going to a parent, who answers yes or no",
  undo: "A list of actions with an arrow curving backwards",
  buckets: "One bar split into spendable, goals, and invested",
  keys: "A phrase turning into a key that locks a device",
};

function Scene({ kind, young }: { kind: ArtKind; young: boolean }) {
  switch (kind) {
    case "vault":
      return <Vault young={young} />;
    case "payday":
      return <Payday young={young} />;
    case "taxjar":
      return <TaxJar young={young} />;
    case "goal":
      return <Goal young={young} />;
    case "snowball":
      return <Snowball young={young} />;
    case "risk-ladder":
      return <RiskLadder young={young} />;
    case "waves":
      return <Waves />;
    case "autopilot":
      return <Autopilot young={young} />;
    case "streak":
      return <Streak young={young} />;
    case "quest":
      return <Quest young={young} />;
    case "approval":
      return <Approval young={young} />;
    case "undo":
      return <Undo />;
    case "buckets":
      return <Buckets young={young} />;
    case "keys":
      return <Keys />;
  }
}

/** Shared ink colour: follows the theme instead of being pinned to black or white. */
const INK = "currentColor";

function Coin({ x, y, r = 9, fill = PALETTE.crypto }: { x: number; y: number; r?: number; fill?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} opacity={0.9} />
      <circle cx={x} cy={y} r={r * 0.62} fill="none" stroke={INK} strokeOpacity={0.35} strokeWidth={1.2} />
    </g>
  );
}

function Vault({ young }: { young: boolean }) {
  // A little kid reads a dial with two hands as a clock, so they get a piggy bank with coins going
  // in instead — no ambiguity about what the thing is or what it's for.
  if (young) {
    return (
      <g>
        <ellipse cx={158} cy={104} rx={78} ry={54} fill={PALETTE.savings} opacity={0.22} />
        <ellipse cx={158} cy={104} rx={78} ry={54} fill="none" stroke={PALETTE.savings} strokeWidth={5} />
        {/* Snout, ear, eye, legs — the minimum that makes it unmistakably a piggy bank. */}
        <ellipse cx={232} cy={104} rx={20} ry={16} fill={PALETTE.savings} opacity={0.35} />
        <ellipse cx={232} cy={104} rx={20} ry={16} fill="none" stroke={PALETTE.savings} strokeWidth={4} />
        <circle cx={227} cy={104} r={3} fill={PALETTE.savings} />
        <circle cx={238} cy={104} r={3} fill={PALETTE.savings} />
        <path d="M116 62 L136 40 L146 66 Z" fill={PALETTE.savings} opacity={0.5} stroke={PALETTE.savings} strokeWidth={4} strokeLinejoin="round" />
        <circle cx={196} cy={92} r={5} fill={PALETTE.savings} />
        <path d="M110 152 L110 168 M154 154 L154 170 M204 150 L204 166" stroke={PALETTE.savings} strokeWidth={7} strokeLinecap="round" />
        {/* The slot, and a coin dropping into it. */}
        <rect x={140} y={54} width={44} height={8} rx={4} fill={PALETTE.savings} />
        <Coin x={162} y={26} r={15} />
        <path d="M162 42 L162 50" stroke={PALETTE.crypto} strokeWidth={4} strokeLinecap="round" />
      </g>
    );
  }

  return (
    <g>
      <rect x={64} y={34} width={192} height={116} rx={14} fill={PALETTE.savings} opacity={0.16} />
      <rect x={64} y={34} width={192} height={116} rx={14} fill="none" stroke={PALETTE.savings} strokeWidth={3} />
      {/* Dial */}
      <circle cx={160} cy={92} r={26} fill="none" stroke={PALETTE.savings} strokeWidth={3} />
      <circle cx={160} cy={92} r={5} fill={PALETTE.savings} />
      {[0, 60, 120, 180, 240, 300].map((angle) => {
        const radians = (angle * Math.PI) / 180;
        return (
          <line
            key={angle}
            x1={160 + Math.cos(radians) * 20}
            y1={92 + Math.sin(radians) * 20}
            x2={160 + Math.cos(radians) * 26}
            y2={92 + Math.sin(radians) * 26}
            stroke={PALETTE.savings}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
      {/* Coins spilling out at the foot, so it reads as "money in here", not "safe". */}
      <Coin x={92} y={140} r={10} />
      <Coin x={116} y={146} r={10} />
      <Coin x={104} y={126} r={10} />
      <Coin x={228} y={140} r={10} />
      <Coin x={212} y={128} r={10} />
      <text x={160} y={26} textAnchor="middle" fontSize={12} fill={INK} opacity={0.6}>
        your account · their balance
      </text>
    </g>
  );
}

function Payday({ young }: { young: boolean }) {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const payIndex = 5;
  return (
    <g>
      {days.map((day, index) => {
        const x = 22 + index * 42;
        const isPay = index === payIndex;
        return (
          <g key={index}>
            <rect
              x={x}
              y={62}
              width={34}
              height={40}
              rx={7}
              fill={isPay ? PALETTE.stocks : INK}
              opacity={isPay ? 0.22 : 0.06}
            />
            <rect
              x={x}
              y={62}
              width={34}
              height={40}
              rx={7}
              fill="none"
              stroke={isPay ? PALETTE.stocks : INK}
              strokeOpacity={isPay ? 1 : 0.2}
              strokeWidth={isPay ? (young ? 4 : 2.5) : 1.5}
            />
            {!young && (
              <text x={x + 17} y={88} textAnchor="middle" fontSize={13} fill={INK} opacity={isPay ? 0.9 : 0.45}>
                {day}
              </text>
            )}
            {isPay && <Coin x={x + 17} y={young ? 34 : 38} r={young ? 15 : 12} />}
            {isPay && (
              <line
                x1={x + 17}
                y1={young ? 52 : 53}
                x2={x + 17}
                y2={60}
                stroke={PALETTE.stocks}
                strokeWidth={3}
                strokeLinecap="round"
                markerEnd=""
              />
            )}
          </g>
        );
      })}
      <text x={160} y={132} textAnchor="middle" fontSize={young ? 20 : 14} fill={PALETTE.stocks} fontWeight={700}>
        {young ? "PAYDAY! 🎉" : "same day, every week"}
      </text>
      {young && (
        <text x={160} y={158} textAnchor="middle" fontSize={15} fill={INK} opacity={0.55}>
          every single week
        </text>
      )}
    </g>
  );
}

function TaxJar({ young }: { young: boolean }) {
  return (
    <g>
      <Coin x={44} y={90} r={young ? 24 : 20} />
      {/* The split */}
      <path d="M72 86 C 110 70, 140 56, 176 52" fill="none" stroke={PALETTE.stocks} strokeWidth={young ? 5 : 3} strokeLinecap="round" />
      <path d="M72 96 C 104 112, 130 126, 168 132" fill="none" stroke={PALETTE.cd} strokeWidth={young ? 5 : 3} strokeLinecap="round" />

      {/* The big share: what actually reaches them. */}
      <rect x={182} y={26} width={104} height={54} rx={10} fill={PALETTE.stocks} opacity={0.18} />
      <rect x={182} y={26} width={104} height={54} rx={10} fill="none" stroke={PALETTE.stocks} strokeWidth={young ? 4 : 2.5} />
      <text x={234} y={58} textAnchor="middle" fontSize={young ? 24 : 18} fill={PALETTE.stocks} fontWeight={700}>
        {young ? "🪙🪙🪙" : "yours"}
      </text>

      {/* The slice. */}
      <path
        d="M186 108 h56 l-6 44 a6 6 0 0 1 -6 5 h-32 a6 6 0 0 1 -6 -5 Z"
        fill={PALETTE.cd}
        opacity={0.2}
      />
      <path
        d="M186 108 h56 l-6 44 a6 6 0 0 1 -6 5 h-32 a6 6 0 0 1 -6 -5 Z"
        fill="none"
        stroke={PALETTE.cd}
        strokeWidth={young ? 4 : 2.5}
      />
      <rect x={182} y={102} width={64} height={8} rx={4} fill={PALETTE.cd} opacity={0.55} />
      <text x={214} y={140} textAnchor="middle" fontSize={young ? 18 : 13} fill={PALETTE.cd} fontWeight={700}>
        {young ? "🪙" : "tax"}
      </text>
      {!young && (
        <text x={44} y={128} textAnchor="middle" fontSize={12} fill={INK} opacity={0.55}>
          allowance
        </text>
      )}
    </g>
  );
}

function Goal({ young }: { young: boolean }) {
  const filled = 0.62;
  return (
    <g>
      <text x={160} y={34} textAnchor="middle" fontSize={young ? 34 : 24}>
        🎯
      </text>
      <rect x={34} y={62} width={252} height={young ? 40 : 30} rx={young ? 20 : 15} fill={INK} opacity={0.08} />
      <rect
        x={34}
        y={62}
        width={252 * filled}
        height={young ? 40 : 30}
        rx={young ? 20 : 15}
        fill={PALETTE.stocks}
        opacity={0.85}
      />
      <rect x={34} y={62} width={252} height={young ? 40 : 30} rx={young ? 20 : 15} fill="none" stroke={INK} strokeOpacity={0.25} strokeWidth={2} />
      {/* Weekly bites, so "a bit each payday" is visible in the bar itself. */}
      {[0.2, 0.4, 0.62].map((stop) => (
        <line
          key={stop}
          x1={34 + 252 * stop}
          y1={62}
          x2={34 + 252 * stop}
          y2={62 + (young ? 40 : 30)}
          stroke="white"
          strokeOpacity={0.65}
          strokeWidth={2}
        />
      ))}
      <text x={160} y={young ? 132 : 124} textAnchor="middle" fontSize={young ? 20 : 14} fill={INK} opacity={0.75}>
        {young ? "keep going!" : "a slice every payday"}
      </text>
      {!young && (
        <text x={160} y={148} textAnchor="middle" fontSize={12} fill={INK} opacity={0.5}>
          the app shows the finish date
        </text>
      )}
    </g>
  );
}

function Snowball({ young }: { young: boolean }) {
  // Same idea both ways: the ball grows because of what it already picked up.
  const balls = [
    { x: 44, y: 128, r: 8 },
    { x: 96, y: 122, r: 13 },
    { x: 156, y: 112, r: 20 },
    { x: 236, y: 94, r: 32 },
  ];
  return (
    <g>
      <path d="M20 150 C 100 148, 200 128, 300 62" fill="none" stroke={INK} strokeOpacity={0.18} strokeWidth={young ? 6 : 4} strokeLinecap="round" />
      {balls.map((ball, index) => (
        <g key={index}>
          <circle cx={ball.x} cy={ball.y} r={ball.r} fill={PALETTE.savings} opacity={0.2 + index * 0.16} />
          <circle cx={ball.x} cy={ball.y} r={ball.r} fill="none" stroke={PALETTE.savings} strokeWidth={young ? 4 : 2.5} />
        </g>
      ))}
      {!young && (
        <>
          <text x={44} y={166} textAnchor="middle" fontSize={11} fill={INK} opacity={0.5}>
            week 1
          </text>
          <text x={236} y={166} textAnchor="middle" fontSize={11} fill={INK} opacity={0.5}>
            a year later
          </text>
          <text x={160} y={34} textAnchor="middle" fontSize={13} fill={PALETTE.savings} fontWeight={600}>
            interest earns interest
          </text>
        </>
      )}
      {young && (
        <text x={150} y={38} textAnchor="middle" fontSize={22} fill={PALETTE.savings} fontWeight={700}>
          bigger… BIGGER!
        </text>
      )}
    </g>
  );
}

function RiskLadder({ young }: { young: boolean }) {
  const rungs = [
    { label: "Savings", emoji: "🚲", color: PALETTE.savings, path: "M0 20 L64 18" },
    { label: "CD", emoji: "🔒", color: PALETTE.cd, path: "M0 20 L30 20 L34 10 L64 8" },
    { label: "Stocks", emoji: "🚀", color: PALETTE.stocks, path: "M0 22 L12 14 L22 24 L34 8 L46 18 L64 4" },
    { label: "Crypto", emoji: "🎢", color: PALETTE.crypto, path: "M0 22 L10 4 L18 26 L28 6 L38 28 L48 2 L64 14" },
  ];
  return (
    <g>
      {rungs.map((rung, index) => {
        const y = 22 + index * 38;
        return (
          <g key={rung.label}>
            <text x={26} y={y + 22} textAnchor="middle" fontSize={young ? 22 : 17}>
              {rung.emoji}
            </text>
            {!young && (
              <text x={48} y={y + 21} fontSize={12} fill={INK} opacity={0.7}>
                {rung.label}
              </text>
            )}
            <g transform={`translate(${young ? 60 : 108}, ${y})`}>
              <path
                d={rung.path}
                transform={`scale(${young ? 3.7 : 3}, 1)`}
                fill="none"
                stroke={rung.color}
                strokeWidth={young ? 4 : 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          </g>
        );
      })}
      {!young && (
        <text x={310} y={172} textAnchor="end" fontSize={11} fill={INK} opacity={0.5}>
          more reward ⇢ more chance of loss
        </text>
      )}
    </g>
  );
}

function Waves() {
  // Deliberately ends higher than it starts, with two drops on the way — the honest shape.
  const line = "M16 100 L52 82 L84 116 L116 70 L148 124 L182 78 L214 96 L248 52 L292 44";
  return (
    <g>
      <line x1={16} y1={100} x2={292} y2={100} stroke={INK} strokeOpacity={0.2} strokeWidth={1.5} strokeDasharray="4 4" />
      <text x={16} y={116} fontSize={11} fill={INK} opacity={0.5}>
        what you put in
      </text>
      <path d={line} fill="none" stroke={PALETTE.stocks} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      {/* Call out the two moments that matter: the scary one and the one that pays. */}
      <circle cx={148} cy={124} r={6} fill="none" stroke={PALETTE.cd} strokeWidth={2.5} />
      <text x={148} y={148} textAnchor="middle" fontSize={11} fill={PALETTE.cd}>
        don&apos;t sell here
      </text>
      <circle cx={292} cy={44} r={6} fill={PALETTE.stocks} />
      <text x={292} y={30} textAnchor="end" fontSize={11} fill={PALETTE.stocks}>
        still up
      </text>
    </g>
  );
}

function Autopilot({ young }: { young: boolean }) {
  return (
    <g>
      {[0, 1, 2].map((index) => {
        const x = 44 + index * 92;
        return (
          <g key={index}>
            <rect x={x - 26} y={54} width={52} height={52} rx={12} fill={PALETTE.savings} opacity={0.14} />
            <rect x={x - 26} y={54} width={52} height={52} rx={12} fill="none" stroke={PALETTE.savings} strokeWidth={young ? 4 : 2.5} />
            <text x={x} y={88} textAnchor="middle" fontSize={young ? 26 : 20}>
              🪙
            </text>
            {!young && (
              <text x={x} y={124} textAnchor="middle" fontSize={11} fill={INK} opacity={0.5}>
                payday {index + 1}
              </text>
            )}
            {index < 2 && (
              <path
                d={`M${x + 30} 80 L${x + 60} 80`}
                stroke={PALETTE.stocks}
                strokeWidth={young ? 4 : 3}
                strokeLinecap="round"
              />
            )}
            {index < 2 && (
              <path
                d={`M${x + 54} 74 L${x + 62} 80 L${x + 54} 86`}
                fill="none"
                stroke={PALETTE.stocks}
                strokeWidth={young ? 4 : 3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        );
      })}
      <text x={160} y={34} textAnchor="middle" fontSize={young ? 20 : 13} fill={PALETTE.stocks} fontWeight={600}>
        {young ? "it happens by itself!" : "decide once — it repeats"}
      </text>
      <text x={160} y={152} textAnchor="middle" fontSize={young ? 18 : 12} fill={INK} opacity={0.55}>
        …and on, without asking
      </text>
    </g>
  );
}

function Streak({ young }: { young: boolean }) {
  return (
    <g>
      {[0, 1, 2, 3].map((index) => (
        <text key={index} x={46 + index * 46} y={90} textAnchor="middle" fontSize={young ? 38 : 30}>
          🔥
        </text>
      ))}
      <path d={`M212 76 L236 76`} stroke={INK} strokeOpacity={0.3} strokeWidth={2} strokeDasharray="3 3" />
      <circle cx={266} cy={72} r={young ? 30 : 25} fill={PALETTE.crypto} opacity={0.2} />
      <circle cx={266} cy={72} r={young ? 30 : 25} fill="none" stroke={PALETTE.crypto} strokeWidth={young ? 4 : 2.5} />
      <text x={266} y={80} textAnchor="middle" fontSize={young ? 24 : 18}>
        🎁
      </text>
      <text x={160} y={132} textAnchor="middle" fontSize={young ? 19 : 13} fill={INK} opacity={0.7}>
        {young ? "4 weeks saving = a prize!" : "weeks without a withdrawal → a match"}
      </text>
      {!young && (
        <text x={160} y={152} textAnchor="middle" fontSize={12} fill={PALETTE.cd}>
          one withdrawal resets it to zero
        </text>
      )}
    </g>
  );
}

function Quest({ young }: { young: boolean }) {
  return (
    <g>
      <rect x={40} y={28} width={240} height={104} rx={12} fill={PALETTE.crypto} opacity={0.1} />
      <rect
        x={40}
        y={28}
        width={240}
        height={104}
        rx={12}
        fill="none"
        stroke={PALETTE.crypto}
        strokeWidth={young ? 5 : 3}
        strokeDasharray="8 6"
      />
      <text x={72} y={70} fontSize={young ? 30 : 24}>
        🧹
      </text>
      <text x={72} y={112} fontSize={young ? 30 : 24}>
        🌿
      </text>
      {!young && (
        <>
          <text x={110} y={66} fontSize={13} fill={INK} opacity={0.75}>
            Tidy the garage
          </text>
          <text x={110} y={108} fontSize={13} fill={INK} opacity={0.75}>
            Weed the beds
          </text>
        </>
      )}
      <Tag x={young ? 200 : 232} y={54} label="$5" />
      <Tag x={young ? 200 : 232} y={96} label="$3" />
      <text x={160} y={158} textAnchor="middle" fontSize={young ? 20 : 13} fill={PALETTE.crypto} fontWeight={700}>
        {young ? "do a job → get paid!" : "posted by you, claimed by them"}
      </text>
    </g>
  );
}

function Tag({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y - 13} width={40} height={26} rx={13} fill={PALETTE.stocks} opacity={0.9} />
      <text x={x + 20} y={y + 5} textAnchor="middle" fontSize={13} fill="white" fontWeight={700}>
        {label}
      </text>
    </g>
  );
}

function Approval({ young }: { young: boolean }) {
  return (
    <g>
      <text x={54} y={92} textAnchor="middle" fontSize={young ? 44 : 34}>
        🧒
      </text>
      <path d="M86 82 L206 82" stroke={PALETTE.savings} strokeWidth={young ? 5 : 3} strokeLinecap="round" />
      <path d="M196 74 L208 82 L196 90" fill="none" stroke={PALETTE.savings} strokeWidth={young ? 5 : 3} strokeLinecap="round" strokeLinejoin="round" />
      <text x={146} y={66} textAnchor="middle" fontSize={young ? 18 : 12} fill={INK} opacity={0.6}>
        {young ? "can I?" : "spend request"}
      </text>
      <text x={244} y={92} textAnchor="middle" fontSize={young ? 44 : 34}>
        👤
      </text>
      <text x={214} y={140} textAnchor="middle" fontSize={young ? 26 : 20}>
        ✅
      </text>
      <text x={272} y={140} textAnchor="middle" fontSize={young ? 26 : 20}>
        ❌
      </text>
      {!young && (
        <text x={90} y={140} fontSize={12} fill={PALETTE.stocks}>
          …or turn it into a goal instead
        </text>
      )}
    </g>
  );
}

function Undo() {
  return (
    <g>
      {[0, 1, 2].map((index) => (
        <g key={index}>
          <rect x={40} y={38 + index * 34} width={190} height={24} rx={6} fill={INK} opacity={index === 1 ? 0.12 : 0.06} />
          <circle cx={54} cy={50 + index * 34} r={5} fill={index === 1 ? PALETTE.cd : INK} opacity={index === 1 ? 0.9 : 0.3} />
          <rect x={68} y={45 + index * 34} width={index === 1 ? 120 : 90} height={9} rx={4.5} fill={INK} opacity={0.25} />
        </g>
      ))}
      {/* The one that went wrong gets the arrow. */}
      <path
        d="M246 72 a22 22 0 1 0 -8 17"
        fill="none"
        stroke={PALETTE.cd}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path d="M232 82 L238 90 L248 86" fill="none" stroke={PALETTE.cd} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <text x={252} y={128} textAnchor="middle" fontSize={12} fill={PALETTE.cd} fontWeight={600}>
        undo
      </text>
      <text x={40} y={158} fontSize={12} fill={INK} opacity={0.5}>
        every action, who did it, when
      </text>
    </g>
  );
}

function Buckets({ young }: { young: boolean }) {
  const parts = [
    { label: "Spendable", share: 0.34, color: PALETTE.crypto },
    { label: "Goals", share: 0.28, color: PALETTE.stocks },
    { label: "Invested", share: 0.38, color: PALETTE.savings },
  ];
  let offset = 0;
  return (
    <g>
      <text x={160} y={36} textAnchor="middle" fontSize={young ? 22 : 15} fill={INK} opacity={0.7} fontWeight={600}>
        {young ? "where is my money?" : "the same money, three jobs"}
      </text>
      {parts.map((part) => {
        const x = 26 + offset * 268;
        const width = 268 * part.share;
        offset += part.share;
        return (
          <g key={part.label}>
            <rect x={x + 1.5} y={58} width={width - 3} height={young ? 44 : 34} rx={8} fill={part.color} opacity={0.85} />
            {!young && (
              <text x={x + width / 2} y={112 + (part.label === "Goals" ? 16 : 0)} textAnchor="middle" fontSize={11} fill={INK} opacity={0.65}>
                {part.label}
              </text>
            )}
          </g>
        );
      })}
      {young && (
        <g>
          <text x={72} y={140} textAnchor="middle" fontSize={26}>
            🛒
          </text>
          <text x={158} y={140} textAnchor="middle" fontSize={26}>
            🎯
          </text>
          <text x={248} y={140} textAnchor="middle" fontSize={26}>
            🌱
          </text>
        </g>
      )}
      {!young && (
        <text x={160} y={158} textAnchor="middle" fontSize={11} fill={INK} opacity={0.5}>
          only the first one can be spent today
        </text>
      )}
    </g>
  );
}

function Keys() {
  return (
    <g>
      <rect x={26} y={56} width={116} height={40} rx={10} fill={INK} opacity={0.07} />
      <rect x={26} y={56} width={116} height={40} rx={10} fill="none" stroke={INK} strokeOpacity={0.25} strokeWidth={2} />
      <text x={84} y={81} textAnchor="middle" fontSize={12} fill={INK} opacity={0.7}>
        purple otter breakfast
      </text>
      <text x={84} y={44} textAnchor="middle" fontSize={11} fill={INK} opacity={0.5}>
        Family Phrase
      </text>

      <path d="M150 76 L184 76" stroke={PALETTE.savings} strokeWidth={3} strokeLinecap="round" />
      <path d="M176 70 L186 76 L176 82" fill="none" stroke={PALETTE.savings} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

      <circle cx={210} cy={76} r={15} fill="none" stroke={PALETTE.savings} strokeWidth={3} />
      <path d="M224 76 L262 76 M252 76 L252 88 M262 76 L262 90" stroke={PALETTE.savings} strokeWidth={3} strokeLinecap="round" />

      <rect x={190} y={110} width={60} height={44} rx={7} fill={PALETTE.savings} opacity={0.12} />
      <rect x={190} y={110} width={60} height={44} rx={7} fill="none" stroke={PALETTE.savings} strokeWidth={2.5} />
      <text x={220} y={140} textAnchor="middle" fontSize={18}>
        🔒
      </text>
      <text x={100} y={140} textAnchor="middle" fontSize={11} fill={PALETTE.cd}>
        lose the phrase → data is gone
      </text>
    </g>
  );
}
