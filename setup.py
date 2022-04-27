"""Setup for XKNX python package."""
from os import environ, path

from setuptools import find_packages, setup

THIS_DIRECTORY = path.abspath(path.dirname(__file__))
with open(path.join(THIS_DIRECTORY, "README.md"), encoding="utf-8") as f:
    LONG_DESCRIPTION = f.read()

version = environ.get("VERSION", None)
if not version:
    raise Exception("No version given. Please set appropriate env vars.")


setup(
    name="xknx-custom-panel",
    description="A custom panel for Home Assistant to work with the KNX integration",
    version=version,
    long_description=LONG_DESCRIPTION,
    long_description_content_type="text/markdown",
    download_url=f"https://github.com/XKNX/custom-panel/archive/{version}.zip",
    author="Marvin Wichmann",
    author_email="me@marvin-wichmann.de",
    license="MIT",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: End Users/Desktop",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
    ],
    packages=find_packages(include=["xknx_custom_panel", "xknx_custom_panel.*"]),
    package_data={"xknx_custom_panel": ["knx-ui.js"]},
    keywords="knx panel xknx custom-panel home-assistant",
    zip_safe=False,
)
