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
                    "stored as 'unassigned' and you should ask which brand it's for rather than guess."
                ),
            },
        },
        "required": ["topic"],
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
        "Move a job to the next state in the pipeline (requested -> researched -> planned -> "
        "generated -> preview -> approved -> published). Illegal jumps are rejected. Note: this "
        "does NOT publish — moving a job to 'published' is recorded only after the gated publish "
        "tool actually runs."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "job_id": {"type": "string", "description": "Full job id or unique short prefix."},
            "to_state": {
                "type": "string",
                "description": "The state to move to.",
                "enum": ["researched", "planned", "generated", "preview", "approved", "published", "failed", "cancelled"],
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
            "platform": {"type": "string", "description": "Target platform.", "enum": ["bluesky"]},
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
        },
        "required": ["job_id", "image_path"],
    },
}
