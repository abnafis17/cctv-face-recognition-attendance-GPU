from starlette.requests import HTTPConnection
from app.core.container import ServiceContainer

def get_container(conn: HTTPConnection) -> ServiceContainer:
    return conn.app.state.container
