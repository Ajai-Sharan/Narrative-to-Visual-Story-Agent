import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const BG_GIF_URL =
  import.meta.env.VITE_BG_GIF_URL ||
  "https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif";

const PROGRESS_STEPS = [
  { label: "Validating story input", weight: 8 },
  { label: "Building storyboard with GPT-4.1", weight: 20 },
  { label: "Warming Hugging Face provider", weight: 32 },
  { label: "Generating scene visuals", weight: 35 },
  { label: "Finalizing timeline output", weight: 5 }
];

const STORY_SUGGESTIONS = [
  {
    title: "Cyber Security Duel",
    text:
      "In the neon-lit servers of Sector 4, an automated sentinel known as the Cloud Auditor detected a breach. It materialized in the virtual space as a glowing blue knight. A rogue script, appearing as a swarm of red digital locusts, tried to bypass the firewall. The knight raised its shield, absorbing the attack before swinging a blade of pure data to sever the connection."
  },
  {
    title: "5:00 AM Gym Victory",
    text:
      "The alarm blared at 5:00 AM. It was day six of the routine. The heavy iron plates in the gym felt like mountains waiting to be moved. Sweat dripped onto the black rubber mat as the final rep was pushed, the echo of the exertion fading into the silent, dimly lit room. A quiet sense of victory settled in."
  },
  {
    title: "Mars Monolith Oasis",
    text:
      "A lone explorer in a white spacesuit stands before a towering, ancient alien monolith buried in the red sands of Mars. The monolith suddenly cracks open, emitting a blinding golden light that reveals a hidden, lush green oasis inside the barren planet."
  }
];

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-700/70 bg-slate-900/40 text-slate-200",
    indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    rose: "border-rose-500/30 bg-rose-500/10 text-rose-200"
  };
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide",
        tones[tone] || tones.slate
      )}
    >
      {children}
    </span>
  );
}

function SkeletonCard({ idx = 0 }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/30 p-4 shadow-[0_10px_40px_-18px_rgba(0,0,0,0.8)]"
      style={{ animationDelay: `${idx * 70}ms` }}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="h-4 w-28 rounded bg-slate-800/70" />
          <div className="h-3 w-20 rounded bg-slate-800/50" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="h-3 w-20 rounded bg-slate-800/60" />
            <div className="h-3 w-56 rounded bg-slate-800/40" />
            <div className="h-3 w-24 rounded bg-slate-800/60" />
            <div className="h-3 w-64 rounded bg-slate-800/40" />
            <div className="h-3 w-16 rounded bg-slate-800/60" />
            <div className="h-3 w-60 rounded bg-slate-800/40" />
          </div>
          <div className="h-64 rounded-xl border border-slate-800/70 bg-slate-950/40" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [storyText, setStoryText] = useState("");
  const [seed, setSeed] = useState(42);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const assetsByScene = useMemo(() => {
    const map = new Map();
    if (!result?.assets) return map;
    for (const a of result.assets) map.set(a.scene_number, a);
    return map;
  }, [result]);

  const progressSnapshot = useMemo(() => {
    let consumed = 0;
    let stepIdx = 0;
    const pctElapsed = Math.min((elapsedSeconds / 300) * 100, 96);
    for (let i = 0; i < PROGRESS_STEPS.length; i += 1) {
      consumed += PROGRESS_STEPS[i].weight;
      if (pctElapsed <= consumed) {
        stepIdx = i;
        break;
      }
      stepIdx = i;
    }
    return {
      stepIdx,
      progressPct: isLoading ? Math.max(4, Math.round(pctElapsed)) : 100
    };
  }, [elapsedSeconds, isLoading]);

  const formattedElapsed = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;
    if (elapsedSeconds < 60) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  }, [elapsedSeconds]);

  useEffect(() => {
    if (!isLoading) return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isLoading]);

  async function onGenerate(overrideStoryText) {
    const textToUse =
      typeof overrideStoryText === "string" ? overrideStoryText : storyText;
    const promptText = (textToUse ?? "").trim();
    if (!promptText) return;
    setError("");
    setResult(null);
    setElapsedSeconds(0);
    setIsLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/generate-story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story_text: promptText,
          seed: Number.isFinite(Number(seed)) ? Number(seed) : 42,
          generate_visuals: true
        })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.detail || `Request failed (${resp.status})`);
      }
      setResult(data);
    } catch (e) {
      const failedAt = PROGRESS_STEPS[progressSnapshot.stepIdx]?.label || "Unknown step";
      const message = e?.message || "Something went wrong.";
      setError(`Failed at: ${failedAt}. ${message}`);
    } finally {
      setIsLoading(false);
    }
  }

  const containerVariants = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.06 }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 16, filter: "blur(6px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] }
    },
    exit: { opacity: 0, y: 10, transition: { duration: 0.2 } }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{
          // Used by .bg-gif-overlay in index.css
          ["--bg-gif-url"]: `url("${BG_GIF_URL}")`
        }}
      >
        <div className="absolute inset-0 bg-gif-overlay" />
        <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-indigo-600/20 blur-3xl" />
        <div className="absolute -bottom-40 right-[-120px] h-[520px] w-[520px] rounded-full bg-fuchsia-600/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(99,102,241,0.10),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(217,70,239,0.10),transparent_45%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-10">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="indigo">Narrative-to-Visual Story Agent</Badge>
            <Badge>FastAPI • GitHub Models • HF Inference</Badge>
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl">
            Turn a story into a scene-by-scene visual storyboard
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
            Paste a free-form narrative. The backend will structure it into a director-style script and
            generate a visual asset per scene using a Hugging Face endpoint.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <section className="rounded-3xl border border-slate-800/70 bg-slate-900/30 p-5 shadow-[0_12px_50px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-100">Your story</h2>
                <Badge tone="emerald">Director mode</Badge>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-400">Seed</label>
                <input
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  className={classNames(
                    "w-28 rounded-xl border border-slate-800/80 bg-slate-950/50 px-3 py-1.5 text-sm text-slate-100 outline-none",
                    "transition focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20"
                  )}
                  inputMode="numeric"
                />
              </div>
            </div>

            <textarea
              value={storyText}
              onChange={(e) => setStoryText(e.target.value)}
              placeholder="Write your story here... (1-3 paragraphs works great)"
              className={classNames(
                "mt-4 h-72 w-full resize-none rounded-2xl border border-slate-800/80 bg-slate-950/40 px-4 py-3 text-sm leading-relaxed text-slate-100 outline-none",
                "transition duration-200 placeholder:text-slate-500",
                "focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20"
              )}
            />

            <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-950/30 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Quick test suggestions
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-3">
                {STORY_SUGGESTIONS.map((item) => (
                  <button
                    key={item.title}
                    disabled={isLoading}
                    onClick={() => {
                      setStoryText(item.text);
                      onGenerate(item.text);
                    }}
                    className={classNames(
                      "rounded-xl border border-slate-800/80 bg-slate-900/40 px-3 py-2 text-left",
                      "transition hover:border-indigo-500/40 hover:bg-slate-900/70",
                      "disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <div className="text-xs font-semibold text-indigo-200">{item.title}</div>
                    <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-300">
                      {item.text}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {isLoading && (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 backdrop-blur">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-amber-200">Generating visual story</div>
                    <div className="text-xs font-medium text-amber-100/90">
                      {progressSnapshot.progressPct}% • {formattedElapsed}
                    </div>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-900/70">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 via-indigo-400 to-fuchsia-400 transition-[width] duration-700"
                      style={{ width: `${progressSnapshot.progressPct}%` }}
                    />
                  </div>
                  <div className="inline-flex w-fit items-center rounded-full border border-amber-400/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                    Total process may take around 10-15 mins.
                  </div>
                  <div className="rounded-2xl border border-slate-800/70 bg-slate-950/25 p-3">
                    <div className="space-y-1">
                      {PROGRESS_STEPS.map((step, idx) => {
                        const isDone = idx < progressSnapshot.stepIdx;
                        const isCurrent = idx === progressSnapshot.stepIdx;
                        const isLast = idx === PROGRESS_STEPS.length - 1;
                        return (
                          <div key={step.label} className="flex items-start gap-3">
                            <div className="flex w-5 shrink-0 flex-col items-center">
                              <div
                                className={classNames(
                                  "flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold",
                                  isDone
                                    ? "border-emerald-300 bg-emerald-400 text-slate-950"
                                    : isCurrent
                                      ? "border-amber-300 bg-amber-400 text-slate-950"
                                      : "border-slate-600 bg-slate-800 text-slate-300"
                                )}
                              >
                                {isDone ? "\u2713" : isCurrent ? "\u25C9" : "\u2022"}
                              </div>
                              {!isLast && (
                                <div
                                  className={classNames(
                                    "mt-1 h-5 w-[2px] rounded-full",
                                    isDone ? "bg-emerald-300/90" : "bg-slate-600/80"
                                  )}
                                />
                              )}
                            </div>
                            <div
                              className={classNames(
                                "pt-0.5 text-xs",
                                isDone
                                  ? "text-emerald-200"
                                  : isCurrent
                                    ? "text-amber-100"
                                    : "text-slate-300"
                              )}
                            >
                              {step.label}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200 backdrop-blur">
                {error}
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setStoryText("");
                  setResult(null);
                  setError("");
                }}
                disabled={isLoading}
                className={classNames(
                  "rounded-2xl border border-slate-800/80 bg-slate-950/30 px-4 py-2 text-sm text-slate-200",
                  "transition hover:border-slate-700 hover:bg-slate-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                Clear
              </button>
              <button
                onClick={() => onGenerate()}
                disabled={isLoading || !storyText.trim()}
                className={classNames(
                  "group relative overflow-hidden rounded-2xl px-4 py-2 text-sm font-semibold text-white",
                  "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500",
                  "shadow-[0_10px_40px_-18px_rgba(124,58,237,0.75)]",
                  "transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <span className="absolute -inset-24 bg-gradient-to-r from-white/0 via-white/15 to-white/0 blur-2xl" />
                </span>
                <span className="relative">Generate Visual Story</span>
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800/70 bg-slate-900/30 p-5 shadow-[0_12px_50px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">Storyboard timeline</h2>
              <Badge tone={isLoading ? "amber" : "slate"}>{isLoading ? "Rendering…" : "Ready"}</Badge>
            </div>

            {!result && !isLoading && (
              <div className="mt-4 rounded-2xl border border-slate-800/70 bg-slate-950/30 p-6 text-sm text-slate-400">
                Your structured script + visuals will appear here.
              </div>
            )}

            {isLoading && (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-slate-800/70 bg-slate-950/30 p-4">
                  <div className="h-3 w-16 rounded bg-slate-800/60" />
                  <div className="mt-2 h-5 w-72 rounded bg-slate-800/40" />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} idx={i} />
                ))}
              </div>
            )}

            <AnimatePresence mode="wait">
              {result?.script && !isLoading && (
                <motion.div
                  key={result.script.title}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="mt-4 space-y-4"
                >
                  <div className="rounded-2xl border border-slate-800/70 bg-slate-950/30 p-4 shadow-[0_10px_40px_-18px_rgba(0,0,0,0.8)]">
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone="indigo">Title</Badge>
                      <Badge>{(result.script.scenes?.length || 0) + " scenes"}</Badge>
                    </div>
                    <div className="mt-3 text-lg font-semibold tracking-tight text-slate-50">
                      {result.script.title}
                    </div>
                  </div>

                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-4"
                  >
                    {result.script.scenes?.map((scene, idx) => {
                      const asset = assetsByScene.get(scene.scene_number);
                      const assetUrl = asset?.url ? `${BACKEND_URL}${asset.url}` : null;

                      return (
                        <motion.div
                          key={scene.scene_number}
                          variants={cardVariants}
                          className={classNames(
                            "rounded-3xl border border-slate-800/70 bg-slate-950/30 p-4 backdrop-blur",
                            "shadow-[0_10px_40px_-18px_rgba(0,0,0,0.8)]",
                            "transition duration-200",
                            "hover:-translate-y-[2px] hover:border-indigo-500/30 hover:bg-slate-950/35"
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Badge tone="indigo">Scene {scene.scene_number}</Badge>
                              <Badge tone="slate">#{String(idx + 1).padStart(2, "0")}</Badge>
                            </div>
                            <div className="text-xs text-slate-400">{asset?.content_type || ""}</div>
                          </div>

                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <div className="space-y-4">
                              <div>
                                <Badge>SETTING</Badge>
                                <div className="mt-2 text-sm text-slate-200">{scene.setting}</div>
                              </div>
                              <div>
                                <Badge>DIALOGUE</Badge>
                                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                                  {scene.dialogue_or_narration}
                                </div>
                              </div>
                              <div>
                                <Badge>ACTION</Badge>
                                <div className="mt-2 text-sm text-slate-200">{scene.action_description}</div>
                              </div>
                              <div>
                                <Badge tone="emerald">VISUAL PROMPT</Badge>
                                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-200">
                                  {scene.visual_prompt}
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-3">
                              {!assetUrl && (
                                <div className="text-sm text-slate-400">No visual returned for this scene yet.</div>
                              )}

                              {assetUrl && asset?.type === "image" && (
                                <img
                                  src={assetUrl}
                                  alt={`Scene ${scene.scene_number}`}
                                  className="h-64 w-full rounded-xl object-cover shadow-[0_10px_40px_-22px_rgba(0,0,0,0.85)]"
                                />
                              )}

                              {assetUrl && asset?.type === "video" && (
                                <video
                                  src={assetUrl}
                                  controls
                                  className="h-64 w-full rounded-xl bg-black/60 object-contain shadow-[0_10px_40px_-22px_rgba(0,0,0,0.85)]"
                                />
                              )}

                              {assetUrl && asset?.type === "unknown" && (
                                <a
                                  href={assetUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm font-medium text-indigo-300 underline decoration-indigo-400/40 underline-offset-4 hover:text-indigo-200"
                                >
                                  Open generated asset
                                </a>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </div>
  );
}

