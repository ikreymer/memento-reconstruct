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
    name='pywb-timetravel',
    version='1.1.0',
#    url='https://github.com/ikreymer/pywb-timetravel',
    author='Ilya Kreymer',
    author_email='ikreymer@gmail.com',
    license='GPL',
    packages=find_packages(),
    description='timetravel across archives!',
    long_description='timetravel across archives!',
    provides=[
        'timetravel',
        ],
    install_requires=[
        'pywb>=0.8.0',
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
