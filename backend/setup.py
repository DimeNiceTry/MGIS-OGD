from setuptools import setup, find_packages

setup(
    name="backend",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        'Django==5.0.2',
        'djangorestframework==3.14.0',
        'django-cors-headers==4.3.1',
        'gunicorn==21.2.0',
        'requests==2.31.0',
        'python-dotenv==1.0.1',
        'drf-yasg==1.21.10'
    ],
) 