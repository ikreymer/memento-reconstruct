#!/usr/bin/env python
# vim: set sw=4 et:

from setuptools import setup, find_packages
from setuptools.command.test import test as TestCommand

class PyTest(TestCommand):
    def finalize_options(self):
        TestCommand.finalize_options(self)
        self.test_suite = True

    def run_tests(self):
        import pytest
        import sys
        import os
        cmdline = ' --cov timetravel -v tests/'
        errcode = pytest.main(cmdline)
        sys.exit(errcode)

setup(
    name='memento-reconstruct',
    version='1.3.0',
#    url='https://github.com/ikreymer/pywb-timetravel',
    author='Ilya Kreymer',
    author_email='ikreymer@gmail.com',
    license='AGPL',
    packages=find_packages(),
    description='Aggregate Wayback Machine!',
    long_description='Aggregate Wayback Machine!',
    provides=[
        'timetravel',
        ],
    install_requires=[
        'pywb>=0.10.5',
        ],
    dependency_links=[
#        "git+git://github.com/ikreymer/pywb.git@develop#egg=pywb-0.8.0"
    ],
    zip_safe=False,
    cmdclass={'test': PyTest},
    test_suite='',
    tests_require=[
        'pytest',
        'pytest-cov',
        'httmock',
    ])
