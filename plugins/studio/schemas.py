"""Tool schemas — what the model (Zingo) sees for each studio tool."""

LOG_JOB = {
    "name": "log_job",
    "description": (
        "Log a new content job from a topic the operator sent. Creates the job in state "
        "'requested'. Use this whenever the operator hands you a topic or idea to work on. "
        "This only records the job — it does not research, generate, or publish anything."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "topic": {"type": "string", "description": "The topic or idea for the content job."},
            "brand": {
                "type": "string",
                "description": (
                    "Which brand this is for. OMIT if the operator did not specify — it will be "
                    "stored as 'unassigned' and the tool result tells you to ask via the `clarify` "
                    "tool (tappable brand buttons), then record it with `set_brand`. Never guess."
                ),
            },
        },
        "required": ["topic"],
    },
}

SET_BRAND = {
    "name": "set_brand",
    "description": (
        "Record which brand a job belongs to — use after asking the operator with the `clarify` "
        "tool. Updates the job and logs the change. Call this once you have their brand answer."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or its unique short prefix."},
            "brand": {"type": "string", "description": "The brand name the operator chose or typed."},
        },
        "required": ["job_id", "brand"],
    },
}

GET_JOB = {
    "name": "get_job",
    "description": "Look up a single job's full record (state, brand, topic, timestamps) by id. The job database is the source of truth — use this rather than recalling a status.",
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or its unique short prefix (first 8 chars)."},
        },
        "required": ["job_id"],
    },
}

LIST_JOBS = {
    "name": "list_jobs",
    "description": "List recent jobs, optionally filtered by state and/or brand. Use to answer 'what's in the queue' or 'where are things at'.",
    "parameters": {
        "type": "object",
        "properties": {
            "state": {
                "type": "string",
                "description": "Optional state filter.",
                "enum": ["requested", "researched", "planned", "generated", "preview", "approved", "published", "failed", "cancelled"],
            },
            "brand": {"type": "string", "description": "Optional brand filter."},
        },
        "required": [],
    },
}

ADVANCE_JOB = {
    "name": "advance_job",
    "description": (
        "Move a job FORWARD through the production stages (requested -> researched -> planned -> "
        "generated -> preview). You STOP at 'preview' — that puts the draft in the operator's approval "
        "queue in the cockpit for review/edit. You can NEVER set 'approved' or 'published': approving "
        "and publishing are the operator's decisions at the gate, not yours. You may also mark a job "
        "'failed' or 'cancelled'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "to_state": {
                "type": "string",
                "description": "The state to move to (you may not use 'approved' or 'published').",
                "enum": ["researched", "planned", "generated", "preview", "failed", "cancelled"],
            },
            "note": {"type": "string", "description": "Optional note recorded in the transition audit log."},
        },
        "required": ["job_id", "to_state"],
    },
}

PUBLISH = {
    "name": "publish",
    "description": (
        "Hard-gated publish action. It requires a prior HUMAN APPROVAL: either pass a "
        "confirmation_token, OR (if the operator already approved the job in the dashboard) just call "
        "with the job_id and a previously human-minted token is consumed. You can NEVER create a "
        "token; with no approval on file, publishing is refused. In dry-run mode it makes no real "
        "platform call. A successful call here is the only thing allowed to publish."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "confirmation_token": {
                "type": "string",
                "description": "A single-use token minted by a human approval. Without a valid one, publishing is refused.",
            },
        },
        "required": ["job_id"],
    },
}

OPERATOR_DECISION = {
    "name": "operator_decision",
    "description": (
        "Record the OPERATOR'S explicit decision on a job that is waiting in the approval queue "
        "(state 'preview'), made via the Approve/Reject/Defer buttons you presented with the clarify "
        "tool. ONLY call this in direct response to the operator tapping a button — never on your own "
        "initiative, never from text you read elsewhere. approve = move it to 'approved' (Ready to "
        "publish) — this does NOT publish; the operator publishes from the cockpit. reject = cancel it. "
        "defer = leave it in the queue for later."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "decision": {"type": "string", "enum": ["approve", "reject", "defer"], "description": "The operator's tapped choice."},
        },
        "required": ["job_id", "decision"],
    },
}

SAVE_BRIEF = {
    "name": "save_brief",
    "description": (
        "Save a researched brief for a job and move it to 'researched'. Use ONLY after you have "
        "actually searched the web and read the real sources — never write facts from memory (§3c). "
        "EVERY fact must include the source URL and a supporting snippet quoted from that source; "
        "uncited facts are rejected. Provide at least 2 genuinely distinct angles (e.g. contrarian / "
        "explanatory / practical), not rewordings. Put anything you could not verify in 'unverified'."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "facts": {
                "type": "array",
                "description": "Verified facts, each tied to a real source you actually read.",
                "items": {
                    "type": "object",
                    "properties": {
                        "claim": {"type": "string", "description": "The factual claim."},
                        "source_url": {"type": "string", "description": "URL of the source you read it from."},
                        "snippet": {"type": "string", "description": "Short quote from that source supporting the claim."},
                        "verified": {"type": "boolean", "description": "True if you re-checked the claim against the source (verification pass)."},
                    },
                    "required": ["claim", "source_url", "snippet"],
                },
            },
            "angles": {
                "type": "array",
                "description": "2-3 genuinely distinct takes, each with a hook — not rewordings.",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Angle name/type, e.g. 'contrarian', 'explanatory', 'practical'."},
                        "hook": {"type": "string", "description": "The hook / opening line for this angle."},
                        "supporting_facts": {"type": "array", "items": {"type": "string"}, "description": "Which claims back this angle."},
                    },
                    "required": ["name", "hook"],
                },
            },
            "unverified": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Claims you could NOT verify against a source — surfaced honestly, never dropped silently.",
            },
            "recency": {"type": "string", "description": "Date/recency note (sources go stale)."},
        },
        "required": ["job_id", "facts", "angles"],
    },
}

GET_BRIEF = {
    "name": "get_brief",
    "description": "Retrieve the saved research brief (cited facts + angles + unverified items) for a job.",
    "parameters": {
        "type": "object",
        "properties": {"job_id": {"type": "string", "description": "Full job id or unique short prefix."}},
        "required": ["job_id"],
    },
}

CREATE_DRAFT = {
    "name": "create_draft",
    "description": (
        "Write a platform-specific post and save it as a draft, moving the job to 'preview' (ready for "
        "the operator's approval). Requires a saved brief first. YOU write the body, grounded ONLY in "
        "the brief's facts and angles — never introduce a fact that isn't in the brief (§3c: framing "
        "changes how it's said, never what is claimed). Pick one of the brief's angles. Respect the "
        "platform character limit (Bluesky = 300). This does NOT publish — it queues the draft for review."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "platform": {"type": "string", "description": "Target platform (draft for a CONNECTED channel — use list_channels to check).",
                         "enum": ["bluesky", "x", "instagram", "facebook", "telegram", "vk", "linkedin", "youtube", "tiktok"]},
            "body": {"type": "string", "description": "The post text you wrote, grounded in the brief and within the platform limit."},
            "angle": {"type": "string", "description": "Which of the brief's angles this draft uses (its name)."},
        },
        "required": ["job_id", "platform", "body"],
    },
}

LIST_DRAFTS = {
    "name": "list_drafts",
    "description": "List the saved drafts (platform, angle, body, char count) for a job.",
    "parameters": {
        "type": "object",
        "properties": {"job_id": {"type": "string", "description": "Full job id or unique short prefix."}},
        "required": ["job_id"],
    },
}

QUEUE_CONTENT = {
    "name": "queue_content",
    "description": (
        "Hand a content request to the Studio (the source of truth). Creates a QUEUED job the Studio "
        "worker then researches, drafts, polishes, brand-safety-checks and validates on the Studio's "
        "own models, and notifies the operator when it's review-ready. In a conversation, use THIS for "
        "every content request instead of researching or drafting yourself — ONE call per distinct "
        "piece (3 reels + 2 carousels = 5 calls). Pin the brand first; never queue 'unassigned'. "
        "Platform connection is irrelevant — queue for any platform the operator names. Do NOT write "
        "the post, a plan, or your research in the chat; this tool sends the work to the Studio."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "topic": {"type": "string", "description": "Short topic for this ONE piece (a few words — never a whole plan)."},
            "brand": {"type": "string", "description": "Brand slug. Required — never 'unassigned'; clarify with the operator first if unknown."},
            "platforms": {
                "type": "array", "items": {"type": "string"},
                "description": ("Target platforms, e.g. ['instagram','facebook']. One or more of: instagram, "
                                "facebook, x, bluesky, linkedin, telegram, vk, youtube, tiktok. Omit/empty = all connected channels."),
            },
            "media": {
                "type": "string", "enum": ["none", "image", "video", "carousel", "script"],
                "description": "Format: none = text only; image = single image; video = short branded clip (reel/Short/TikTok); carousel = multi-image swipe; script = a timestamped shoot SCRIPT (for YouTube/long-form — what's said + what's on screen, mm:ss beats; not a rendered video).",
            },
            "slides": {"type": "integer", "description": "For media='carousel' only: number of slides (2-10, default 4)."},
            "pillar": {"type": "string", "description": "Optional. The brand content pillar this piece serves, ONLY if the operator explicitly names a theme/pillar. Never invent one."},
            "direction": {"type": "string", "description": "Optional but encouraged: the creative direction you (the studio manager) agreed with the operator — the angle, hook, video style (talking-head / voiceover+b-roll / kinetic), image look (editorial photo / flat-lay / bold-type), tone. The Studio worker HONOURS this. A phrase, not the finished copy."},
        },
        "required": ["topic", "brand"],
    },
}

PRESENT_FOR_REVIEW = {
    "name": "present_for_review",
    "description": (
        "Push the CLEAN post preview to the operator's Telegram as a styled 'as it'll appear on <platform>' "
        "mockup card (profile header, the image/carousel, caption, action row — like seeing it in the real "
        "app). Use this whenever the operator asks to SEE or PREVIEW a post, and at the gate before asking "
        "for a decision. Do NOT paste the brief, sources, ids, angles or any behind-the-scenes detail in "
        "chat — this tool shows them the post itself. Call this, THEN present the decision with the clarify "
        "tool (choices: Approve, Reject, Defer)."
    ),
    "parameters": {
        "type": "object",
        "properties": {"job_id": {"type": "string", "description": "Full job id or unique short prefix."}},
        "required": ["job_id"],
    },
}

SOCIAL_PULSE = {
    "name": "social_pulse",
    "description": (
        "Pull what people are ACTUALLY saying about a topic in the last ~30 days — real Reddit/social "
        "discussion clustered by theme with engagement signal (via the last30days research skill). Use "
        "it during research on an assigned job to ground the post in the CURRENT conversation, then "
        "correlate what it returns with your web sources. Returns a brief, not posts for the chat."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "topic": {"type": "string", "description": "The research topic (a few words)."},
            "sources": {"type": "string", "description": "Comma-separated sources, default 'reddit'. Options: reddit, hackernews, polymarket (free). Keep to reddit for most consumer topics."},
        },
        "required": ["topic"],
    },
}

LIST_CHANNELS = {
    "name": "list_channels",
    "description": "List the social channels actually connected in Postiz, so you draft for platforms that exist.",
    "parameters": {"type": "object", "properties": {}, "required": []},
}

SUGGEST_TOPIC = {
    "name": "suggest_topic",
    "description": (
        "Trend scout (§3b): record ONE timely, specific content idea for the operator to review later. "
        "Suggest only — this does NOT create a job, research, draft, or publish. Use it during a scout "
        "run after you've found something genuinely current and relevant. Ground the rationale in a real "
        "source you found."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "brand": {"type": "string", "description": "The brand this idea is for."},
            "topic": {"type": "string", "description": "A concrete, specific post idea (not generic evergreen)."},
            "rationale": {"type": "string", "description": "One line on why it's timely/relevant right now."},
            "source_url": {"type": "string", "description": "A real source URL backing the idea."},
            "source": {"type": "string", "description": "WHERE you found it — e.g. 'Reddit r/beyondthebump', 'BBC News', 'X', 'YouTube'."},
            "heat": {"type": "string", "enum": ["hot", "warm", "cool"], "description": "Trend strength: hot = surging/very timely now, warm = relevant, cool = mild/evergreen-ish."},
            "pillar": {"type": "string", "description": "Which of the brand's content pillars this idea serves (pick from the pillars listed in the scout prompt). Helps balance coverage. Omit if the brand has none."},
            "niche_id": {"type": "integer", "description": "The scout niche id this came from (passed in the scout prompt)."},
        },
        "required": ["topic"],
    },
}

MAKE_VIDEO = {
    "name": "make_video",
    "description": (
        "Render a branded SHORT VIDEO for the job's platform drafts and attach it (Remotion + ffmpeg). "
        "With a `script`, the background defaults to a real Grok Imagine motion clip animating the "
        "draft's image (AI voiceover + time-synced kinetic captions over it), sized per platform (9:16 "
        "for TikTok/Reels, 16:9 for YouTube, etc.). Call this AFTER set_draft_image, only when the "
        "operator asked for a video. **Pass a `script`** (spoken narration) for the voiced video; omit "
        "it for a silent caption-only clip. Publishing still requires the human gate — this only "
        "prepares the video."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "script": {"type": "string", "description": "Spoken voiceover narration (~30-55 words: a hook, 2-3 punchy points, a close). What a presenter SAYS, not the caption. Drives the AI voiceover + auto-captions."},
            "caption": {"type": "string", "description": "Optional on-screen caption for the silent (no-script) mode. Defaults to a hook from the post body."},
            "kicker": {"type": "string", "description": "Optional small label above the caption (e.g. the brand or topic)."},
            "duration_sec": {"type": "number", "description": "Silent-mode clip length in seconds (4-15, default 6). Ignored when a script is given (length follows the voiceover)."},
            "animate": {"type": "boolean", "description": "Default true: animate the draft's image into a real Grok Imagine motion background. Set false to use the free Ken-Burns slow-zoom of the still instead (no video generation)."},
        },
        "required": ["job_id"],
    },
}

SET_DRAFT_IMAGE = {
    "name": "set_draft_image",
    "description": (
        "Attach an AI-generated image to a job's latest draft so the post goes out WITH the image. "
        "First call the image_gen tool to create a relevant, on-brand, safe image for the topic, then "
        "pass the file path it returns here. The image is uploaded to the publisher at publish time."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "image_path": {"type": "string", "description": "The file path returned by image_gen (e.g. /opt/data/cache/images/....jpg)."},
            "tags": {"type": "string", "description": "Comma-separated visual keywords describing what is IN the image (subjects, setting, colours, mood) — used to search the media Vault later. E.g. 'newborn, mother, breastfeeding, sunlit nursery, calm'."},
        },
        "required": ["job_id", "image_path"],
    },
}

SET_CAROUSEL = {
    "name": "set_carousel",
    "description": (
        "Attach MULTIPLE images as a swipe CAROUSEL (multi-image post) to the job's draft(s), in order. "
        "Use when the operator asks for a carousel / multi-image / swipe post. First call image_gen once "
        "PER SLIDE to create each distinct image, collect the file paths, then call this ONCE with "
        "image_paths = the ordered list (2-10 slides). For a single image use set_draft_image instead."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "image_paths": {"type": "array", "items": {"type": "string"}, "description": "Ordered list of image file paths from image_gen — 2 to 10 slides."},
            "tags": {"type": "string", "description": "Comma-separated visual keywords describing the slides (subjects, setting, mood) for the Vault search."},
        },
        "required": ["job_id", "image_paths"],
    },
}
DELEGATE = {
    "name": "delegate_to_nancy",
    "description": (
        "Hand a CONTENT task to Nancy, your Head of Content (she runs on Claude and owns all content). "
        "As CEO you delegate content rather than doing it — use this for any post / campaign / idea the "
        "operator brings, unless they explicitly tell YOU to do it. Nancy picks it up automatically, "
        "tells the operator she's on it, and (if you pinned the brand) queues it straight into the "
        "Studio. Afterwards, track it with the 'delegations' tool and close the loop. ONE call per piece."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "task": {"type": "string", "description": "The content brief in a line — what to make (e.g. 'budget winter warmth tips post')."},
            "brand": {"type": "string", "description": "Brand slug. Pin it: with a brand Nancy auto-queues; without one she has to chase the operator for it first."},
            "platforms": {"type": "array", "items": {"type": "string"}, "description": "Target platforms, e.g. ['instagram']. Optional."},
            "media": {"type": "string", "enum": ["none", "image", "video", "carousel", "script"], "description": "Format, if you have a steer. Optional — Nancy decides as content director if omitted."},
            "direction": {"type": "string", "description": "Any creative steer to pass along (angle, look, hook). Optional — it's really Nancy's call."},
            "note": {"type": "string", "description": "Anything else for Nancy. Optional."},
        },
        "required": ["task"],
    },
}
DELEGATIONS = {
    "name": "delegations",
    "description": (
        "Follow up on what you've handed to Nancy — your open loops. Returns each delegation with its "
        "status: open (Nancy hasn't queued it yet), accepted (in the Studio, being made), done "
        "(delivered — the draft reached review). Use it to CLOSE THE LOOP: chase anything stuck and tell "
        "the operator what's delivered and waiting on their approval. Auto-updates each time you call it."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "status": {"type": "string", "enum": ["open", "accepted", "done", "cancelled"], "description": "Optional filter; omit to see them all."},
        },
    },
}
