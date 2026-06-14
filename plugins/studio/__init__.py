"""Studio plugin — registers the Phase 0 job-store tools with Hermes."""
from . import schemas, tools, db


def register(ctx):
    # Ensure the SQLite store + schema exist before any tool runs.
    db.init_db()

    ctx.register_tool(name="log_job", toolset="studio", schema=schemas.LOG_JOB, handler=tools.log_job)
    ctx.register_tool(name="queue_content", toolset="studio", schema=schemas.QUEUE_CONTENT, handler=tools.queue_content)
    ctx.register_tool(name="set_brand", toolset="studio", schema=schemas.SET_BRAND, handler=tools.set_brand)
    ctx.register_tool(name="get_job", toolset="studio", schema=schemas.GET_JOB, handler=tools.get_job)
    ctx.register_tool(name="list_jobs", toolset="studio", schema=schemas.LIST_JOBS, handler=tools.list_jobs)
    ctx.register_tool(name="advance_job", toolset="studio", schema=schemas.ADVANCE_JOB, handler=tools.advance_job)
    # NOTE: no 'publish' tool for the agent — publishing is a human action in the cockpit (§4a).
    # The agent's job ends at 'preview'. tools.publish remains for the CLI/approval path only.
    ctx.register_tool(name="save_brief", toolset="studio", schema=schemas.SAVE_BRIEF, handler=tools.save_brief)
    ctx.register_tool(name="get_brief", toolset="studio", schema=schemas.GET_BRIEF, handler=tools.get_brief)
    ctx.register_tool(name="create_draft", toolset="studio", schema=schemas.CREATE_DRAFT, handler=tools.create_draft)
    ctx.register_tool(name="list_drafts", toolset="studio", schema=schemas.LIST_DRAFTS, handler=tools.list_drafts)
    ctx.register_tool(name="set_draft_image", toolset="studio", schema=schemas.SET_DRAFT_IMAGE, handler=tools.set_draft_image)
    ctx.register_tool(name="set_carousel", toolset="studio", schema=schemas.SET_CAROUSEL, handler=tools.set_carousel)
    ctx.register_tool(name="make_video", toolset="studio", schema=schemas.MAKE_VIDEO, handler=tools.make_video)
    ctx.register_tool(name="suggest_topic", toolset="studio", schema=schemas.SUGGEST_TOPIC, handler=tools.suggest_topic)
    ctx.register_tool(name="operator_decision", toolset="studio", schema=schemas.OPERATOR_DECISION, handler=tools.operator_decision)
    ctx.register_tool(name="present_for_review", toolset="studio", schema=schemas.PRESENT_FOR_REVIEW, handler=tools.present_for_review)
    ctx.register_tool(name="social_pulse", toolset="studio", schema=schemas.SOCIAL_PULSE, handler=tools.social_pulse)
    ctx.register_tool(name="list_channels", toolset="studio", schema=schemas.LIST_CHANNELS, handler=tools.list_channels)
