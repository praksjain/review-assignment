import pytest
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from base_plugin import BasePlugin


class DummyPlugin(BasePlugin):
    @property
    def name(self):
        return "dummy"

    def handle(self, event, settings=None):
        self.last_event = event


class TestBasePluginMatches:

    def test_matches_when_event_type_in_list(self):
        p = DummyPlugin()
        event = {"event_type": "payment.completed"}
        settings = {"event_types": ["payment.completed", "item.added"]}
        assert p.matches(event, settings) is True

    def test_no_match_when_event_type_not_in_list(self):
        p = DummyPlugin()
        event = {"event_type": "employee.login"}
        settings = {"event_types": ["payment.completed"]}
        assert p.matches(event, settings) is False

    def test_matches_all_when_event_types_empty(self):
        p = DummyPlugin()
        event = {"event_type": "anything"}
        settings = {"event_types": []}
        assert p.matches(event, settings) is True

    def test_matches_all_when_no_event_types_key(self):
        p = DummyPlugin()
        event = {"event_type": "anything"}
        settings = {}
        assert p.matches(event, settings) is True

    def test_abstract_class_cannot_be_instantiated(self):
        with pytest.raises(TypeError):
            BasePlugin()
