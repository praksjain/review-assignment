import os
import importlib
import inspect
import logging

from base_plugin import BasePlugin

log = logging.getLogger("plugin_loader")

PLUGINS_DIR = os.path.join(os.path.dirname(__file__), "plugins")


def discover_plugins() -> list[BasePlugin]:
    """
    Scan the plugins/ directory, import every .py module, and instantiate
    all concrete BasePlugin subclasses found.  No changes to this function
    are needed when a new plugin is added — just drop a file into plugins/.
    """
    instances = []

    for filename in sorted(os.listdir(PLUGINS_DIR)):
        if filename.startswith("_") or not filename.endswith(".py"):
            continue

        module_name = f"plugins.{filename[:-3]}"
        try:
            mod = importlib.import_module(module_name)
        except Exception:
            log.exception("Failed to import plugin module %s", module_name)
            continue

        for attr_name in dir(mod):
            attr = getattr(mod, attr_name)
            if (
                inspect.isclass(attr)
                and issubclass(attr, BasePlugin)
                and attr is not BasePlugin
                and not inspect.isabstract(attr)
            ):
                try:
                    instance = attr()
                    instances.append(instance)
                    log.info("Loaded plugin: %s", instance.name)
                except Exception:
                    log.exception("Failed to instantiate plugin %s", attr_name)

    log.info("Total plugins discovered: %d", len(instances))
    return instances
