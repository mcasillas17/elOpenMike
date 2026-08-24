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

export type Project = {
  slug: string; // URL segment + React key
  title: string;
  summary: string; // one-liner (card + detail)
  year: string; // e.g. "2025"
  tags: string[]; // chips
  stack: string[]; // tech list
  highlights: string[]; // "What it does" bullets (detail page)
  liveUrl?: string;
  repoUrl?: string;
  youtubeId?: string; // optional trailer/demo embedded on the detail page
  images: string[]; // /images/projects/...; carousel on the detail page only
  mediaLayout?: "portrait"; // defaults to the existing landscape carousel
  caseStudy?: CaseStudy; // detailed engineering narrative for flagship projects
};

// Real projects (pulled from github.com/mcasillas17). Array order controls
// display order: the first four appear in the home Projects section as a
// hybrid comic-panel grid (large + tall + wide + small); the first two also
// headline the /projects featured row. Listing surfaces don't render
// screenshots — `images` shows up on the detail page carousel only.
export const projects: Project[] = [
  {
    slug: "websnag",
    title: "WebSnag",
    summary:
      "A local-first Android focus app that turns NFC tags, app-blocking profiles, and deliberate unlock friction into context-aware digital self-control.",
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
      "NFC tags activate and release focused app-blocking profiles without a cloud account or dedicated hardware.",
      "Blocklist and allowlist modes support both targeted distraction blocking and a stricter dumbphone-style setup.",
      "An event-driven Accessibility Service intercepts blocked foreground apps and presents a calm Compose overlay.",
      "Emergency unlocks add a cooldown and typed intention so recovery stays possible without becoming an impulsive bypass.",
    ],
    repoUrl: "https://github.com/mcasillas17/WebSnag",
    images: [
      "/images/projects/websnag-dashboard.png",
      "/images/projects/websnag-profiles.png",
      "/images/projects/websnag-nfc-enrollment.png",
      "/images/projects/websnag-blocker.png",
    ],
    mediaLayout: "portrait",
    caseStudy: {
      problem:
        "Make clear-headed decisions about distracting apps enforceable later on an ordinary Android phone, without requiring a cloud account, telemetry, dedicated hardware, or device-owner privileges.",
      whatIBuilt: [
        "A Jetpack Compose app for focus sessions, blocklist and allowlist profiles, installed-app selection, NFC enrollment, setup, and blocking feedback.",
        "A local persistence and domain layer for profiles, NFC tags, focus-session history, triggers, unlock conditions, and reactive enforcement state.",
        "An event-driven enforcement path that checks foreground packages, returns blocked launches to the home screen, and opens a focused blocker overlay.",
      ],
      constraints: [
        "The app targets standard consumer Android 8+ rather than Device Owner or MDM APIs, so it creates deliberate friction instead of claiming an irreversible lock.",
        "Foreground interception requires the user to enable WebSnag's Accessibility Service during setup.",
        "NFC remains optional for activation because the dashboard also provides a press-and-hold remote action; enrolled tags provide the stronger physical unlock boundary.",
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
            title: "NFC action resolver",
            detail:
              "A tag tap activates a linked inactive profile, unlocks an authorized active profile, rejects the wrong tag, or routes an unknown tag into enrollment.",
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
          title: "NFC resolution tests",
          detail:
            "Resolver tests cover linked-tag activation, authorized deactivation, wrong-tag rejection, enrolled unlinked tags, and unknown tags.",
        },
        {
          title: "Buildable Android surface",
          detail:
            "The repository defines JDK 17, Android API 26 minimum support, Gradle test and debug APK commands, and separate local and instrumented test dependencies.",
        },
      ],
      status:
        "Current public status: version 0.1.0 implements NFC enrollment and profile toggling, blocklist and allowlist enforcement, remote hold-to-lock activation, focus timing and activity, setup, blocker feedback, and emergency unlock friction. Time, location, Wi-Fi, strict-mode, and optional companion integrations remain roadmap items.",
      lessons: [
        "A physical trigger can turn an abstract intention into an environmental boundary while still letting the app work without proprietary hardware.",
        "Consumer self-control software needs both fast enforcement and an explicit recovery path; friction is safer and more credible than pretending bypass is impossible.",
      ],
      evidence: [
        {
          label: "README: product, architecture, and roadmap",
          href: "https://github.com/mcasillas17/WebSnag#readme",
          detail:
            "Documents the shipped NFC and blocking experience, local-first principles, Android requirements, screenshots, and deferred contextual triggers.",
        },
        {
          label: "Enforcement engine source",
          href: "https://github.com/mcasillas17/WebSnag/blob/main/app/src/main/java/org/websnag/core/enforcement/EnforcementEngine.kt",
          detail:
            "Shows active-profile observation, package caches, blocklist and allowlist decisions, system exemptions, session records, and emergency cooldown behavior.",
        },
        {
          label: "Accessibility interception source",
          href: "https://github.com/mcasillas17/WebSnag/blob/main/app/src/main/java/org/websnag/service/WebSnagAccessibilityService.kt",
          detail:
            "Shows event-driven foreground checks, self and system exemptions, interception debouncing, launcher return, and overlay launch.",
        },
        {
          label: "Enforcement and NFC tests",
          href: "https://github.com/mcasillas17/WebSnag/tree/main/app/src/test/java/org/websnag",
          detail:
            "Provides focused unit-test evidence for enforcement state, filter modes, recovery timing, session tracking, and NFC action resolution.",
        },
      ],
    },
  },
  {
    slug: "mexican-mom",
    title: "Mexican Mom",
    summary:
      "A cross-platform Agent Skills plugin that gives coding agents a rigorously tested engineering-discipline layer with a distinct Mexican-mom voice.",
    year: "2026",
    tags: ["AI", "Developer tools", "Open source"],
    stack: ["Agent Skills", "Markdown", "Node.js", "YAML", "GitHub Actions"],
    highlights: [
      "Twenty-three focused engineering-discipline skills plus a manual router keep each intervention narrow and explicit.",
      "One shared Agent Skills tree installs across Claude Code, GitHub Copilot CLI, and OpenAI Codex.",
      "Node.js validation and GitHub Actions enforce frontmatter, cross-skill routing, listing-size, packaging, and version contracts.",
      "Rules target false success claims, premature “not found” reports, swallowed failures, unsafe destructive actions, and prompt-injection attempts.",
    ],
    repoUrl: "https://github.com/mcasillas17/mexican-mom",
    images: [],
  },
  {
    slug: "thwiply",
    title: "Thwiply",
    summary:
      "An Android v1 scaffold for downloading a device-held model and trying streamed, on-device LLM inference from a debug screen.",
    year: "2026",
    tags: ["Android", "AI", "Open source"],
    stack: [
      "Kotlin",
      "Jetpack Compose",
      "LiteRT-LM",
      "Gemma 3",
      "Hilt",
    ],
    highlights: [
      "Compose onboarding that downloads a model to the app’s files directory and reports download state.",
      "LiteRT-LM engine initialization and streamed debug inference after a model is available.",
      "Hilt-provided app dependencies, Coroutines/Flow state, and an OkHttp download client.",
      "The public roadmap keeps notification capture, OCR, task extraction, Room persistence, and a Today screen as v2 work.",
    ],
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
    summary:
      "A humane, force-free dog-training support platform — owners keep a structured behavior journal, find science-based trainers, and export a shareable “Behavior Brief” PDF.",
    year: "2026",
    tags: ["Web app", "Full-stack"],
    stack: ["TypeScript", "Next.js", "Node", "PostgreSQL", "Drizzle"],
    highlights: [
      "Structured behavior journal for puppy and newly-adopted-dog owners.",
      "Exportable “Behavior Brief” PDF to share with a trainer.",
      "Directory to find science-based, force-free trainers.",
    ],
    repoUrl: "https://github.com/mcasillas17/TuringCare",
    images: [],
  },
  {
    slug: "light-master",
    title: "Light Master",
    summary:
      "A Unity platformer where enemy behavior is evolved with genetic programming over behavior trees.",
    year: "2019",
    tags: ["Game", "AI", "Unity"],
    stack: ["Unity", "C#", "HLSL"],
    highlights: [
      "Side-scrolling platformer built in Unity (C#).",
      "Enemy behavior trees are evolved using genetic programming.",
    ],
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
