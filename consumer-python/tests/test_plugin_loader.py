import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from plugin_loader import discover_plugins
from base_plugin import BasePlugin


def _native_deps_available():
    try:
        import psycopg2       # noqa: F401
        import confluent_kafka  # noqa: F401
        return True
    except ImportError:
        return False


class TestPluginLoader:

    def test_discovers_at_least_one_plugin(self):
        plugins = discover_plugins()
        assert len(plugins) >= 1

    def test_discovers_all_when_deps_present(self):
        if not _native_deps_available():
            return  # full discovery only works inside Docker
        plugins = discover_plugins()
        assert len(plugins) == 3

    def test_all_are_base_plugin_instances(self):
        plugins = discover_plugins()
        for p in plugins:
            assert isinstance(p, BasePlugin)

    def test_unique_names(self):
        plugins = discover_plugins()
        names = [p.name for p in plugins]
        assert len(names) == len(set(names))

    def test_http_call_plugin_always_loadable(self):
        plugins = discover_plugins()
        names = {p.name for p in plugins}
        assert "http_call_plugin" in names

    def test_expected_plugin_names_full(self):
        if not _native_deps_available():
            return
        plugins = discover_plugins()
        names = {p.name for p in plugins}
        assert "http_call_plugin" in names
        assert "db_writer_plugin" in names
        assert "event_publisher_plugin" in names
