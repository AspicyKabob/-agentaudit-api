from setuptools import setup, find_packages

setup(
    name="agentaudit-client",
    version="1.0.2",
    description="Audit \u0026 Compliance SDK for AI Agents",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="AgentAudit Team",
    author_email="support@agentaudit.io",
    url="https://github.com/agentaudit/agentaudit-python",
    packages=find_packages(),
    install_requires=[
        "requests>=2.25.0",
    ],
    extras_require={
        "langchain": ["langchain>=0.1.0"],
        "dev": ["pytest>=7.0", "black", "mypy"],
    },
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    keywords="ai agents audit compliance langchain monitoring",
)
