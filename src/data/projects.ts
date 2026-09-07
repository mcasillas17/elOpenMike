export type CaseStudyItem = {
  title: string;
  detail: string;
};

export type CaseStudyEvidence = {
  label: string;
  href: string;
  detail: string;
};

export type CaseStudyArchitecture = {
  flowLabel: string;
  nodes: CaseStudyItem[];
};

export type CaseStudy = {
  problem: string;
  whatIBuilt: string[];
  constraints: string[];
  architecture: CaseStudyArchitecture;
  decisions: CaseStudyItem[];
  verification: CaseStudyItem[];
  status: string;
  lessons: string[];
  evidence: CaseStudyEvidence[];
};

export const projectCategories = [
  { id: "products", label: "Products" },
  { id: "developer-tools", label: "Developer tools" },
  { id: "games", label: "Games" },
] as const;

export type ProjectCategory = (typeof projectCategories)[number]["id"];

export type Project = {
  slug: string; // URL segment + React key
  title: string;
  category: ProjectCategory;
  summary: string; // one-liner (card + detail)
  cardSummary?: string;
  preview?:
    | { kind: "flow"; label: string; steps: string[] }
    | { kind: "quote"; quote: string; caption: string };
  year: string; // e.g. "2025"
  tags: string[]; // chips
  stack: string[]; // tech list
  highlights: string[]; // "What it does" bullets (detail page)
  vision?: string;
  liveUrl?: string;
  repoUrl?: string;
  youtubeId?: string; // optional trailer/demo embedded on the detail page
  images: string[]; // /images/projects/...; first image on covers, all in the detail carousel
  mediaLayout?: "portrait"; // defaults to the existing landscape carousel
  imageFit?: "contain"; // opt out of cropping on covers and in the detail carousel
  mediaCredit?: { label: string; href: string };
  caseStudy?: CaseStudy; // retained technical notes; public pages use highlights and vision
};

// Array order assigns stable issue numbers: prepend new entries rather than
// reordering existing ones. Categories and homepage curation control presentation.
export const projects: Project[] = [
  {
    slug: "watchslinger",
    title: "Watchslinger",
    category: "products",
    summary:
      "Custom e-paper watch firmware built on Watchy, bringing personal watchfaces, customizable menus, and weather to a wearable you can make your own.",
    cardSummary:
      "Make an e-paper watch your own with custom faces, menus, and weather. Firmware built on Watchy.",
    preview: {
      kind: "flow",
      label: "Wearable firmware concept",
      steps: ["Your watchface", "Your menus", "Your weather"],
    },
    year: "2026",
    tags: ["Hardware", "Wearable", "Open source"],
    stack: ["C++", "Arduino", "PlatformIO", "ESP32-S3", "E-paper"],
    highlights: [
      "Build a personal watchface for Watchy v3's 200x200 e-paper display.",
      "Use familiar Watchy watchface interfaces while customizing the firmware underneath.",
      "Add your own menu apps, combine them with stock entries, or replace the menu entirely.",
      "Choose Open-Meteo weather or connect an OpenWeatherMap provider.",
    ],
    vision:
      "Make wearables something you can understand, adapt, and own, from what appears on your wrist to the services behind it.",
    repoUrl: "https://github.com/mcasillas17/Watchslinger",
    images: [],
  },
  {
    slug: "webslinger-cli",
    title: "WebSlinger-CLI",
    category: "developer-tools",
    summary:
      "A Go command-line tool that turns a project idea into a ready-to-work web app, with scaffolding and a Fly.io deployment workflow from the terminal.",
    cardSummary:
      "From idea to a running web project: scaffold an app and ship it from the terminal.",
    preview: {
      kind: "flow",
      label: "CLI workflow concept",
      steps: ["thwip new", "Build", "thwip ship"],
    },
    year: "2026",
    tags: ["CLI", "Developer tools", "Open source"],
    stack: ["Go", "Cobra", "TOML", "Embedded templates", "Fly.io"],
    highlights: [
      "Create a Next.js app with TypeScript, Tailwind, and pnpm using thwip new.",
      "Start with a Git repository and an initial commit instead of repeating setup by hand.",
      "Use embedded templates to keep project scaffolding close to the tool.",
      "Deploy the project to Fly.io with the thwip ship workflow.",
    ],
    vision:
      "Shorten the distance between an idea and a working product, keeping repeatable setup and shipping steps out of the way of building.",
    repoUrl: "https://github.com/mcasillas17/WebSlinger-CLI",
    images: [],
  },
  {
    slug: "coding-skills",
    title: "Knights of the Round Table",
    category: "developer-tools",
    summary:
      "A coordinated AI engineering workflow that takes a coding task through implementation, independent review, repairs, documentation, and pull-request delivery.",
    cardSummary:
      "Turn a coding task into a reviewed pull request with a coordinated team of AI implementers and independent reviewers.",
    preview: {
      kind: "flow",
      label: "AI engineering workflow concept",
      steps: ["Implement", "Review & repair", "Deliver PR"],
    },
    year: "2026",
    tags: ["AI", "Developer tools", "Open source"],
    stack: ["Agent Skills", "Node.js", "Markdown", "YAML"],
    highlights: [
      "Give a coding task a repeatable path from implementation to pull-request delivery.",
      "Use independent reviewer agents to examine the work and feed findings into repair rounds.",
      "Keep documentation and validation part of the delivery workflow.",
      "Bring the workflow to Claude Code, GitHub Copilot, Codex, and Gemini harnesses.",
    ],
    vision:
      "Make AI-assisted engineering a coordinated practice, where implementation, critique, and evidence work together instead of relying on one agent's confidence.",
    repoUrl: "https://github.com/mcasillas17/coding-skills",
    images: [],
  },
  {
    slug: "panda-path",
    title: "Panda Path",
    category: "games",
    summary:
      "A Unity puzzle game about guiding a panda across a 5x5 grid, collecting bamboo, and making every move count.",
    cardSummary:
      "A panda, a 5x5 grid, and a limited number of moves. Find a path to the bamboo.",
    preview: {
      kind: "flow",
      label: "Puzzle mechanic concept",
      steps: ["Read the grid", "Plan moves", "Collect bamboo"],
    },
    year: "2018",
    tags: ["Game", "Puzzle", "Unity"],
    stack: ["Unity", "C#"],
    highlights: [
      "Guide the panda through compact 5x5 puzzle boards.",
      "Plan a route that collects bamboo within the level's move limit.",
      "Play levels defined as text-based layouts, separating board design from movement logic.",
    ],
    vision:
      "Create approachable strategy puzzles where a small board and a simple goal reward thoughtful choices.",
    repoUrl: "https://github.com/mcasillas17/Panda_Path",
    images: [],
  },
  {
    slug: "prehispanicapp",
    title: "PrehispanicApp",
    category: "games",
    summary:
      "A mobile educational game built in Unity that invites players to explore pre-Hispanic cultures through period selection and minigames.",
    cardSummary:
      "Explore pre-Hispanic cultures through historical periods and playful minigames.",
    preview: {
      kind: "flow",
      label: "Learning game concept",
      steps: ["Choose a period", "Explore a culture", "Play"],
    },
    year: "2018",
    tags: ["Game", "Education", "Unity"],
    stack: ["Unity", "C#", "Mobile"],
    highlights: [
      "Choose a historical period as an entry point into the experience.",
      "Navigate culture-focused activities and minigames.",
      "Explore Maya-themed gameplay through a touch-friendly mobile game format.",
    ],
    vision:
      "Make cultural curiosity an invitation to play, using interactive experiences to open a door to pre-Hispanic history.",
    repoUrl: "https://github.com/mcasillas17/PrehispanicApp",
    images: [],
  },
  {
    slug: "scorearc",
    title: "ScoreArc",
    category: "products",
    summary:
      "A live football platform built around the 2026 World Cup, with a signature arc bracket, fixtures, standings, and news in English and Spanish.",
    cardSummary:
      "Follow the World Cup through a signature arc bracket. Live football, fixtures, standings, and news in English and Spanish.",
    year: "2026",
    tags: ["Web app", "Sports", "Full-stack"],
    stack: ["TypeScript", "Next.js", "Go", "PostgreSQL", "Cloudflare R2"],
    highlights: [
      "See the whole World Cup knockout journey in one arc, from the Round of 32 to the final.",
      "Follow live scores, upcoming fixtures, and standings across football competitions.",
      "Explore match details and the latest competition news without losing your place in the tournament.",
      "Switch between English and Spanish, with navigation and dates that follow your language.",
    ],
    vision:
      "Build a richer, connected football experience: a place where live matchdays, tournament history, deeper insights, and the screens around you tell one continuous story of the game.",
    liveUrl: "https://www.scorearc.futbol/en/c/world-cup/2026",
    repoUrl: "https://github.com/mcasillas17/ScoreArc",
    images: ["/images/projects/scorearc-world-cup.webp"],
    imageFit: "contain",
    mediaCredit: {
      label: "Live World Cup screenshot",
      href: "/images/projects/CREDITS.md",
    },
  },
  {
    slug: "wallcrawl",
    title: "WallCrawl",
    category: "products",
    summary:
      "A local-first Android workout planner and progress tracker with a bundled exercise catalog, reusable routines, type-aware set logging, and user-owned backups.",
    cardSummary:
      "Plan a workout, log each set, and see your progress. A local-first Android app with reusable routines and user-owned data.",
    year: "2026",
    tags: ["Android", "Fitness", "Open source"],
    stack: ["Kotlin", "Jetpack Compose", "Room", "Coroutines", "Flow"],
    highlights: [
      "Plan workouts around your equipment and goals, or build reusable routines from a searchable catalog of 302 exercises.",
      "Log each set with the right fields for reps, weight, assistance, duration, or distance, and keep a rest timer close at hand.",
      "Follow your workout history, weekly consistency, training volume, and progress over time.",
      "Keep your data on your phone, with your own exports, restore controls, and a fully offline English or Spanish interface.",
    ],
    vision:
      "Grow into a private, on-device training companion that understands your routines and helps you build lasting consistency, with your workout history always under your control.",
    repoUrl: "https://github.com/mcasillas17/WallCrawl",
    images: [
      "/images/projects/wallcrawl-today.webp",
      "/images/projects/wallcrawl-active-workout.webp",
      "/images/projects/wallcrawl-progress.webp",
    ],
    mediaLayout: "portrait",
    mediaCredit: {
      label: "WallCrawl screenshots; exercise artwork by Everkinetic & Workout Guide (CC BY-SA 4.0)",
      href: "/images/projects/CREDITS.md",
    },
  },
  {
    slug: "websnag",
    title: "WebSnag",
    category: "products",
    summary:
      "A local-first Android focus app that combines NFC locks, recurring schedules, allowlist profiles, and deliberate unlock friction to make distractions harder to reach.",
    cardSummary:
      "A local-first Android focus app. NFC locks, schedules, and a little deliberate friction between you and your distractions.",
    year: "2026",
    tags: ["Android", "Productivity", "Open source"],
    stack: [
      "Kotlin",
      "Jetpack Compose",
      "NFC",
      "AccessibilityService",
      "DataStore",
    ],
    highlights: [
      "Physical NFC tags and a tactile hold-to-lock action activate focused profiles without cloud accounts or dedicated hardware.",
      "Recurring schedules automate blocklist or allowlist profiles for workdays, bedtime, and other routines.",
      "An event-driven Accessibility Service intercepts blocked foreground apps and presents a calm Compose overlay.",
      "Local activity history tracks focused time and blocked attempts, while emergency unlocks preserve a deliberate recovery path.",
    ],
    vision:
      "Make focus a choice you can carry into your environment: simple routines, physical cues, and thoughtful friction that help you spend your attention on what matters.",
    repoUrl: "https://github.com/mcasillas17/WebSnag",
    images: [
      "/images/projects/websnag-dashboard.png",
      "/images/projects/websnag-schedules.png",
      "/images/projects/websnag-activity.png",
      "/images/projects/websnag-nfc-enrollment.png",
    ],
    mediaLayout: "portrait",
    caseStudy: {
      problem:
        "Make clear-headed decisions about distracting apps enforceable later on an ordinary Android phone, without requiring a cloud account, telemetry, dedicated hardware, or device-owner privileges.",
      whatIBuilt: [
        "A Jetpack Compose app for focus sessions, recurring schedules, blocklist and allowlist profiles, activity history, NFC enrollment, setup, and blocking feedback.",
        "A local persistence and domain layer for profiles, schedules, NFC tags, focus-session history, unlock conditions, and reactive enforcement state.",
        "An event-driven enforcement path that checks foreground packages, returns blocked launches to the home screen, and opens a focused blocker overlay.",
      ],
      constraints: [
        "The app targets standard consumer Android 8+ rather than Device Owner or MDM APIs, so it creates deliberate friction instead of claiming an irreversible lock.",
        "Foreground interception requires the user to enable WebSnag's Accessibility Service during setup.",
        "NFC remains optional for activation because the dashboard hold action and recurring schedules can start profiles; enrolled tags provide the stronger physical unlock boundary.",
      ],
      architecture: {
        flowLabel:
          "Compose screens persist profiles and enrolled tags locally. A scanned tag resolves to a profile transition, the enforcement engine caches the active rule set, and the Accessibility Service sends blocked launches to the overlay.",
        nodes: [
          {
            title: "Compose UI & repositories",
            detail:
              "Dashboard, profile, tag, setup, and overlay surfaces read and update locally persisted domain state through Flow-backed repositories.",
          },
          {
            title: "NFC & schedule coordinators",
            detail:
              "Tag taps resolve activation and release actions, while recurring schedules evaluate time windows and coordinate automatic profile transitions.",
          },
          {
            title: "Enforcement engine",
            detail:
              "The engine observes the active profile and maintains a constant-time package cache, filter mode, timer state, exemptions, and interception count.",
          },
          {
            title: "Accessibility service & overlay",
            detail:
              "Window-state events are checked without polling; blocked launches return home and open the Compose overlay with current focus context.",
          },
        ],
      },
      decisions: [
        {
          title: "Keep focus data local",
          detail:
            "Profiles, tags, activity, and enforcement state stay on-device, with no backend, account, telemetry, or network dependency in the enforcement loop.",
        },
        {
          title: "React to windows instead of polling",
          detail:
            "The Accessibility Service listens for foreground window changes and delegates package decisions to an in-memory cache, reducing latency and battery work.",
        },
        {
          title: "Design a safe but inconvenient escape hatch",
          detail:
            "The app pairs tag-based unlocking with a timed emergency path and intention phrase so users cannot be permanently stranded but must pause before bypassing a session.",
        },
      ],
      verification: [
        {
          title: "Enforcement state tests",
          detail:
            "Unit tests cover activation, deactivation, blocklist checks, allowlist checks, system exemptions, blocked-attempt recording, session timing, and emergency cooldown completion.",
        },
        {
          title: "NFC and schedule tests",
          detail:
            "Tests cover tag-based activation and release plus schedule formatting, same-day and overnight windows, Wi-Fi conditions, disabled routines, and overlap detection.",
        },
        {
          title: "Buildable Android surface",
          detail:
            "The repository defines JDK 17, Android API 26 minimum support, Gradle test and debug APK commands, and separate local and instrumented test dependencies.",
        },
      ],
      status:
        "Public repository snapshot reviewed at commit db40858 implements NFC and scheduled profile activation, blocklist and allowlist enforcement, remote hold-to-lock activation, session history, theme controls, setup, blocker feedback, and emergency unlock friction.",
      lessons: [
        "A physical trigger can turn an abstract intention into an environmental boundary while still letting the app work without proprietary hardware.",
        "Consumer self-control software needs both fast enforcement and an explicit recovery path; friction is safer and more credible than pretending bypass is impossible.",
      ],
      evidence: [
        {
          label: "README: product, architecture, and roadmap",
          href: "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/README.md",
          detail:
            "Documents the current NFC, schedules, filtering, activity, themes, screenshots, and Android requirements.",
        },
        {
          label: "Enforcement engine source",
          href: "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/main/java/org/websnag/core/enforcement/EnforcementEngine.kt",
          detail:
            "Shows active-profile observation, package caches, blocklist and allowlist decisions, system exemptions, session records, and emergency cooldown behavior.",
        },
        {
          label: "Schedule manager source",
          href: "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/main/java/org/websnag/core/schedule/ScheduleManager.kt",
          detail:
            "Shows periodic schedule evaluation, automatic profile activation, and deactivation when an automatically started window ends.",
        },
        {
          label: "Enforcement and NFC tests",
          href: "https://github.com/mcasillas17/WebSnag/tree/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/test/java/org/websnag",
          detail:
            "Covers enforcement, NFC resolution, schedule windows, Wi-Fi conditions, overlap detection, and activity summaries.",
        },
      ],
    },
  },
  {
    slug: "mexican-mom",
    title: "Mexican Mom",
    category: "developer-tools",
    summary:
      "A cross-platform Agent Skills plugin that gives coding agents a rigorously tested engineering-discipline layer with a distinct Mexican-mom voice.",
    cardSummary:
      "Engineering discipline for coding agents, delivered with a distinctly Mexican-mom voice.",
    preview: {
      kind: "quote",
      quote: "A ver, enséñame.",
      caption: "Evidence before confidence.",
    },
    year: "2026",
    tags: ["AI", "Developer tools", "Open source"],
    stack: ["Agent Skills", "Markdown", "Node.js", "YAML", "GitHub Actions"],
    highlights: [
      "Twenty-three focused engineering-discipline skills plus a manual router keep each intervention narrow and explicit.",
      "One shared Agent Skills tree installs across Claude Code, GitHub Copilot CLI, and OpenAI Codex.",
      "Node.js validation and GitHub Actions enforce frontmatter, cross-skill routing, listing-size, packaging, and version contracts.",
      "Rules target false success claims, premature “not found” reports, swallowed failures, unsafe destructive actions, and prompt-injection attempts.",
    ],
    vision:
      "Make careful engineering habits feel natural in everyday AI-assisted work, with a memorable voice that keeps evidence, clarity, and human intent at the center.",
    repoUrl: "https://github.com/mcasillas17/mexican-mom",
    images: [],
  },
  {
    slug: "thwiply",
    title: "Thwiply",
    category: "products",
    summary:
      "An Android companion for manual Today tasks and on-device AI experiments, with persistent task storage and a streaming LLM Lab.",
    cardSummary:
      "Keep Today tasks on your phone and explore on-device AI in a streaming LLM Lab, with model setup on your terms.",
    preview: {
      kind: "flow",
      label: "Local LLM Lab",
      steps: ["Choose model", "Set up", "Stream"],
    },
    year: "2026",
    tags: ["Android", "AI", "Open source"],
    stack: [
      "Kotlin",
      "Jetpack Compose",
      "Room",
      "Hilt",
      "Coroutines",
      "LiteRT-LM",
      "ML Kit",
    ],
    highlights: [
      "Create, complete, and delete manual tasks in Today, with changes that persist across app restarts.",
      "Stream responses in the local LLM Lab using Qwen 2.5 through LiteRT-LM or Gemini Nano through ML Kit/AICore on supported devices.",
      "Start with Today and Settings, then enter optional model setup when you want to explore local inference.",
      "Keep theme and provider preferences across app restarts.",
    ],
    vision:
      "Turn everyday notifications and captured text into useful, organized tasks through a private assistant that lives on your device.",
    repoUrl: "https://github.com/mcasillas17/Thwiply",
    images: [],
    caseStudy: {
      problem:
        "Start with a private, device-held model workflow that can be downloaded, initialized, and exercised before building the planned capture-and-task experience.",
      whatIBuilt: [
        "A Jetpack Compose Android scaffold with onboarding and debug routes.",
        "A model manager that streams a model download into app-local storage and exposes download progress through Flow.",
        "A LiteRT-LM engine manager that initializes a local model and returns streamed inference output to the debug screen.",
      ],
      constraints: [
        "The public README sets Android 12 (API 31) as the minimum and recommends a Pixel 6 or equivalent for smoother inference.",
        "The Gemma model download may require a Hugging Face read token because the model is gated.",
        "The v1 source keeps the current product surface to onboarding and debug inference; capture and persistence are not presented as shipped work.",
      ],
      architecture: {
        flowLabel:
          "Onboarding collects a model URL and optional token, stores the downloaded model locally, then hands it to the on-device inference path.",
        nodes: [
          {
            title: "Compose onboarding",
            detail:
              "Starts the download and navigates to the debug screen after success.",
          },
          {
            title: "ModelManager + OkHttp",
            detail:
              "Fetches the model and writes model.litertlm under the app’s files directory while emitting progress.",
          },
          {
            title: "LiteRT-LM engine",
            detail:
              "Initializes from that local file and exposes streamed generated text.",
          },
          {
            title: "Debug screen",
            detail:
              "Collects streamed output for a prompt; this is the current inference surface.",
          },
        ],
      },
      decisions: [
        {
          title: "Prove local inference first",
          detail:
            "The implementation routes a downloaded file into LiteRT-LM rather than introducing a backend or cloud inference path.",
        },
        {
          title: "Keep model lifecycle observable",
          detail:
            "Download state is represented explicitly as idle, downloading, success, or error and is collected by the onboarding view model.",
        },
        {
          title: "Sequence the product deliberately",
          detail:
            "The README separates current v1 scaffolding from the planned v2 capture, OCR, extraction, persistence, and Today-screen work.",
        },
      ],
      verification: [
        {
          title: "Unit-test starting state",
          detail:
            "The repository includes a ModelManager unit test for the no-model initial state.",
        },
        {
          title: "Build-time proof surface",
          detail:
            "The repository documents Android Studio build/run steps and declares JUnit plus Android instrumentation test dependencies.",
        },
      ],
      status:
        "Current public status: the README labels v1 scaffolding as current. Its checked items are architecture, model management/download, LiteRT-LM integration with streaming inference, and a debug inference UI; the v2 capture pipeline remains unchecked.",
      lessons: [
        "A local model path benefits from making download and initialization states visible before asking it to support a larger background workflow.",
        "The next repository-defined increments are notification and screenshot observation, OCR pre-filtering, task extraction, Room persistence, and a Today screen.",
      ],
      evidence: [
        {
          label: "README: v1 scope and v2 roadmap",
          href: "https://github.com/mcasillas17/Thwiply#roadmap",
          detail:
            "Documents the current scaffolding milestones, device/model prerequisites, and the explicitly deferred capture pipeline.",
        },
        {
          label: "ModelManager source",
          href: "https://github.com/mcasillas17/Thwiply/blob/main/app/src/main/java/com/elopenmike/thwiply/llm/model/ModelManager.kt",
          detail:
            "Shows app-local model storage, download-state Flow, optional bearer token, and OkHttp download handling.",
        },
        {
          label: "Inference and navigation source",
          href: "https://github.com/mcasillas17/Thwiply/blob/main/app/src/main/java/com/elopenmike/thwiply/MainActivity.kt",
          detail:
            "Shows the onboarding-to-debug navigation route used by the current app surface.",
        },
        {
          label: "ModelManager test",
          href: "https://github.com/mcasillas17/Thwiply/blob/main/app/src/test/java/com/elopenmike/thwiply/llm/model/ModelManagerTest.kt",
          detail:
            "Provides the public unit-test evidence for the model-availability starting state.",
        },
      ],
    },
  },
  {
    slug: "turingagent",
    title: "TuringAgent",
    category: "developer-tools",
    cardSummary:
      "A private assistant stack with a Go backend, Flutter client, model routing, and human-approved MCP actions.",
    preview: {
      kind: "flow",
      label: "TuringAgent architecture",
      steps: ["Flutter client", "Go backend", "Models + MCP"],
    },
    summary:
      "A local-first AI orchestration platform — a Flutter client and Go gRPC backend that run a private assistant stack with model routing, streaming, MCP tools, and approval-gated actions.",
    year: "2026",
    tags: ["AI", "Full-stack", "Open source"],
    stack: ["Go", "gRPC", "Flutter", "Ollama", "MCP", "Docker"],
    highlights: [
      "Go gRPC orchestrator for sessions, messages, runs, events, and approvals.",
      "Connects to local or OpenAI-compatible models (Ollama by default).",
      "MCP tool servers for safe system tools and approval-gated sandboxed file access.",
      "Flutter client with chat, streamed responses, and approval cards.",
    ],
    vision:
      "Bring models, tools, and personal workflows together in a private assistant workspace where you choose the models and stay in control of the actions.",
    repoUrl: "https://github.com/mcasillas17/TuringAgent",
    images: [],
    caseStudy: {
      problem:
        "Provide a machine-local assistant stack that can coordinate chat, model routing, tool execution, and human approval without exposing MCP services to the host network.",
      whatIBuilt: [
        "A Go gRPC orchestration layer for sessions, messages, runs, events, approvals, audit records, and SQLite persistence.",
        "A Go agent runtime that loads context, calls local or OpenAI-compatible models, executes MCP tools, and streams runtime updates.",
        "A Flutter client for settings, sessions, chat, streamed responses, and approval cards.",
      ],
      constraints: [
        "Local secrets, data, and sandbox files are kept under the backend directory; initialization rejects root execution and unsafe sandbox conditions.",
        "The file-tool surface is sandboxed, and mutating operations require a short-lived approval token plus approval consumption.",
        "MCP services remain on internal Docker networks instead of becoming host-published services.",
      ],
      architecture: {
        flowLabel:
          "The client sends gRPC work to the orchestrator; the agent runtime loads context, reaches model providers, and calls internal MCP services. Mutating file tools pause for approval before execution.",
        nodes: [
          {
            title: "Flutter client",
            detail:
              "Presents settings, session/chat UI, streamed events, model selection, and approval cards.",
          },
          {
            title: "Go orchestrator",
            detail:
              "Owns public and internal gRPC APIs, sessions, runs, events, approvals, audit records, and SQLite persistence.",
          },
          {
            title: "Go agent runtime",
            detail:
              "Loads session context, calls model providers, executes tools, and streams runtime updates.",
          },
          {
            title: "Model providers & internal MCP",
            detail:
              "The runtime reaches Ollama or an OpenAI-compatible provider and calls internal MCP services; file mutations require approval validation.",
          },
        ],
      },
      decisions: [
        {
          title: "Separate public and internal control planes",
          detail:
            "Docker Compose publishes the public orchestrator gRPC port while keeping the runtime and MCP services on internal networks.",
        },
        {
          title: "Make file mutation an explicit human decision",
          detail:
            "Approval-gated writes use a short-lived JWT bound to the tool and argument hash, then consume approval through internal gRPC before mutation proceeds.",
        },
        {
          title: "Constrain the sandbox at the file-descriptor level",
          detail:
            "The file server uses descriptor-relative operations and no-follow flags to reject traversal and symlink escapes rather than relying on path rewriting alone.",
        },
      ],
      verification: [
        {
          title: "End-to-end gRPC smoke test",
          detail:
            "The repository script starts Compose, checks health, creates a session, sends a deterministic system.time tool message, observes streamed events, and verifies event replay.",
        },
        {
          title: "Model-driven tool-loop check",
          detail:
            "An on-demand script asks a real Ollama model to choose system.time and distinguishes a broken exercised loop from an inconclusive setup or model outcome; it is intentionally outside CI.",
        },
        {
          title: "Layered engineering checks",
          detail:
            "The documented matrix includes Go race tests, vet/build checks, protobuf validation, MCP-server checks, and Flutter analysis/tests.",
        },
      ],
      status:
        "Current public status: the repository documents a local development stack with Docker Compose, a Flutter client, a gRPC smoke test, and an on-demand live tool-loop check. This case study does not make a production-deployment or usage claim.",
      lessons: [
        "A tool boundary needs both product-level approval and implementation-level confinement; neither replaces the other.",
        "A useful AI integration check needs a deterministic smoke path and a separately labelled model-driven path whose inconclusive outcomes are not reported as failures.",
      ],
      evidence: [
        {
          label: "README: local stack and verification",
          href: "https://github.com/mcasillas17/TuringAgent#verify-the-stack",
          detail:
            "Documents the local install, smoke test, model-driven check, and developer command set.",
        },
        {
          label: "Architecture and Compose boundary",
          href: "https://github.com/mcasillas17/TuringAgent/blob/main/docs/architecture/tech-stack.md",
          detail:
            "Documents the runtime responsibilities, public/internal gRPC ports, and Docker-network exposure.",
        },
        {
          label: "MCP approval and sandbox design",
          href: "https://github.com/mcasillas17/TuringAgent/blob/main/docs/mcp-security-and-integration.md",
          detail:
            "Documents approval ordering, token checks, bounded tool behaviour, and descriptor-relative file confinement.",
        },
        {
          label: "Smoke-test implementation",
          href: "https://github.com/mcasillas17/TuringAgent/blob/main/turing-backend/scripts/smoke-grpc.sh",
          detail:
            "Shows the Compose startup, health wait, and gRPC smoke-client execution used for the documented proof path.",
        },
      ],
    },
  },
  {
    slug: "turingcare",
    title: "TuringCare",
    category: "products",
    cardSummary:
      "A behavior journal, practice goals, and a shareable brief that help dog owners work with force-free trainers.",
    summary:
      "A bilingual dog-training companion that brings behavior journaling, practice goals, and force-free support together in a shareable Behavior Brief.",
    year: "2026",
    tags: ["Web app", "Full-stack"],
    stack: [
      "TypeScript", "React", "Vite", "React Router", "TanStack Query",
      "Hono", "Drizzle", "PostgreSQL", "Better Auth", "i18next",
    ],
    highlights: [
      "Keep a structured behavior journal to capture everyday observations about your dog.",
      "Set training goals, work on skills, and choose a weekly practice focus.",
      "Find positive-reinforcement trainers and courses to support your next steps.",
      "Export a shareable Behavior Brief PDF to bring your journal and training context to a trainer.",
      "Use the journal and training tools in English or Spanish.",
    ],
    vision:
      "Help dog owners and trainers build a shared understanding of everyday behavior, making compassionate, force-free support easier to find and follow.",
    liveUrl: "https://turingcare.dog/",
    repoUrl: "https://github.com/mcasillas17/TuringCare",
    images: [
      "/images/projects/turingcare-website.webp",
      "/images/projects/turingcare-behavior-brief.webp",
    ],
    imageFit: "contain",
    mediaCredit: {
      label: "Public website and Behavior Brief explanation",
      href: "/images/projects/CREDITS.md",
    },
  },
  {
    slug: "light-master",
    title: "Light Master",
    category: "games",
    summary:
      "A Unity platformer where enemy behavior is evolved with genetic programming over behavior trees.",
    year: "2019",
    tags: ["Game", "AI", "Unity"],
    stack: ["Unity", "C#", "HLSL"],
    highlights: [
      "Side-scrolling platformer built in Unity (C#).",
      "Enemy behavior trees are evolved using genetic programming.",
    ],
    vision:
      "Explore how evolving enemy behavior can make game worlds more surprising, expressive, and engaging to play.",
    repoUrl: "https://github.com/mcasillas17/Light_Master",
    youtubeId: "0RjQiMqRIoE",
    images: [
      "/images/projects/light-master-1.jpg",
      "/images/projects/light-master-2.jpg",
      "/images/projects/light-master-3.jpg",
      "/images/projects/light-master-4.jpg",
    ],
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return projects.map((p) => p.slug);
}

export const featuredProjects = ["scorearc", "wallcrawl", "turingcare", "websnag", "turingagent", "watchslinger"].map(
  (slug) => {
    const project = getProject(slug);
    if (!project) throw new Error(`Featured project not found: ${slug}`);
    return project;
  },
);
