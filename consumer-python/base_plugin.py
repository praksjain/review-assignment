from abc import ABC, abstractmethod


class BasePlugin(ABC):
    """
    Abstract base class every plugin must extend.

    Subclasses provide a unique `name` and implement `handle(event)`.
    The default `matches()` checks event_type against the configured event_types list,
    but plugins can override this for custom eligibility logic.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def handle(self, event: dict) -> None:
        """Execute the plugin action for a qualifying event."""
        ...

    def matches(self, event: dict, settings: dict) -> bool:
        """Return True if this event should be processed by this plugin."""
        allowed_types = settings.get("event_types", [])
        if not allowed_types:
            return True
        return event.get("event_type") in allowed_types
