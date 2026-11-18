"""Username format errors stay concise while validation rules remain strict."""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import app, norm_username


@pytest.mark.parametrize("invalid", ["ab", "1abc", "abc-def", "x" * 25, "name with spaces"])
def test_invalid_username_has_consistent_short_error(invalid):
    with pytest.raises(HTTPException) as error:
        norm_username(invalid)
    assert error.value.status_code == 422
    assert error.value.detail == "Tên đăng nhập không đúng định dạng."


def test_valid_username_still_normalizes():
    assert norm_username("Valid_User1") == "valid_user1"


def test_username_check_api_reports_only_short_error():
    client = TestClient(app)
    assert client.get("/").status_code == 200
    response = client.post("/api/username/check", json={"username": "abc-def"})
    assert response.status_code == 422
    assert response.json()["detail"] == "Tên đăng nhập không đúng định dạng."
