from os import path

from setuptools import find_packages, setup

THIS_DIRECTORY = path.abspath(path.dirname(__file__))
with open(path.join(THIS_DIRECTORY, "README.md"), encoding="utf-8") as f:
    LONG_DESCRIPTION = f.read()

version = "main"

setup(
    name="knx_frontend",
    version,
    url="https://github.com/XKNX/knx-frontend",
    license="MIT License",
    long_description=LONG_DESCRIPTION,
    long_description_content_type="text/markdown",
    download_url=f"https://github.com/XKNX/knx-frontend/archive/{version}.zip",
    author="Marvin Wichmann",
    author_email="me@marvin-wichmann.de",
    packages=find_packages(include=["knx_frontend", "knx_frontend.*"]),
    include_package_data=True,
    keywords="knx panel xknx custom-panel home-assistant",
    zip_safe=False,
)
