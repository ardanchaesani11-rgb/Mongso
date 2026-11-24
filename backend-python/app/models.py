from typing import Any, Optional, Union
from pydantic import BaseModel, field_validator


def parse_commodity_id(v: Any) -> int:
    if isinstance(v, int) and not isinstance(v, bool):
        return v
    if isinstance(v, str):
        s = v.strip()
        if s.isdigit():
            return int(s)
        mapping = {
            "cabai_rawit": 1,
            "cabai rawit": 1,
            "bawang_merah": 2,
            "bawang merah": 2,
            "cabai_merah_besar": 3,
            "cabai merah besar": 3,
            "cabai_merah": 3,
            "tomat": 4,
            "kentang": 5,
            "kubis": 6,
            "kol": 6,
            "kubis / kol": 6,
        }
        return mapping.get(s.lower(), 1)
    raise ValueError("commodity_id tidak valid")


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    role: Optional[str] = None
    regency: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class EmailOnlyRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


class GoogleAuthRequest(BaseModel):
    credential: str
    regency: Optional[str] = None


class CreateFieldRequest(BaseModel):
    name: str
    latitude: float
    longitude: float
    commodity_id: int


class EvaluatePlanRequest(BaseModel):
    commodity_id: Union[int, str]
    regency_name: str
    area_ha: float
    start_date: str

    @field_validator("commodity_id", mode="before")
    @classmethod
    def _coerce_commodity_id(cls, v: Any) -> int:
        return parse_commodity_id(v)


class SavePlanRequest(BaseModel):
    commodity_id: Union[int, str]
    regency_name: str
    area_ha: float
    start_date: str

    @field_validator("commodity_id", mode="before")
    @classmethod
    def _coerce_commodity_id(cls, v: Any) -> int:
        return parse_commodity_id(v)
