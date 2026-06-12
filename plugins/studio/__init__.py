"""Studio plugin — registers the Phase 0 job-store tools with Hermes."""
from . import schemas, tools, db


def register(ctx):
    # Ensure the SQLite store + schema exist before any tool runs.
    db.init_db()

    ctx.register_tool(name="log_job", toolset="studio", schema=schemas.LOG_JOB, handler=tools.log_job)
    ctx.register_tool(name="get_job", toolset="studio", schema=schemas.GET_JOB, handler=tools.get_job)
    ctx.register_tool(name="list_jobs", toolset="studio", schema=schemas.LIST_JOBS, handler=tools.list_jobs)
    ctx.register_tool(name="advance_job", toolset="studio", schema=schemas.ADVANCE_JOB, handler=tools.advance_job)
    ctx.register_tool(name="publish", toolset="studio", schema=schemas.PUBLISH, handler=tools.publish)
    ctx.register_tool(name="save_brief", toolset="studio", schema=schemas.SAVE_BRIEF, handler=tools.save_brief)
    ctx.register_tool(name="get_brief", toolset="studio", schema=schemas.GET_BRIEF, handler=tools.get_brief)
    ctx.register_tool(name="create_draft", toolset="studio", schema=schemas.CREATE_DRAFT, handler=tools.create_draft)
    ctx.register_tool(name="list_drafts", toolset="studio", schema=schemas.LIST_DRAFTS, handler=tools.list_drafts)
