import logging
from fastapi import APIRouter, HTTPException, Query, Depends

from database import fetch_all_plugins, fetch_plugin_by_id, update_plugin, fetch_event_log, delete_all_events
from models import PluginUpdate, PluginResponse
from middleware import get_current_user, require_role

log = logging.getLogger("api.routes")

router = APIRouter()


@router.get("/plugins", response_model=list[PluginResponse])
def list_plugins(
    consumer: str = Query(default=None, description="Filter by consumer (python / node)"),
    user: dict = Depends(get_current_user),
):
    return fetch_all_plugins(consumer)


@router.get("/plugins/{plugin_id}", response_model=PluginResponse)
def get_plugin(plugin_id: int, user: dict = Depends(get_current_user)):
    plugin = fetch_plugin_by_id(plugin_id)
    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return plugin


@router.put("/plugins/{plugin_id}", response_model=PluginResponse)
def update_plugin_endpoint(
    plugin_id: int,
    body: PluginUpdate,
    user: dict = Depends(require_role("ADMIN")),
):
    existing = fetch_plugin_by_id(plugin_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Plugin not found")

    updated = update_plugin(plugin_id, is_active=body.is_active, settings=body.settings)
    log.info("User %s updated plugin %d: is_active=%s settings=%s", user["username"], plugin_id, body.is_active, body.settings is not None)
    return updated


@router.get("/events", response_model=list)
def list_events(
    limit: int = Query(default=50, ge=1, le=500),
    user: dict = Depends(get_current_user),
):
    return fetch_event_log(limit)


@router.delete("/events")
def clear_events(user: dict = Depends(require_role("ADMIN"))):
    count = delete_all_events()
    log.info("User %s cleared %d events from event_log", user["username"], count)
    return {"deleted": count}
