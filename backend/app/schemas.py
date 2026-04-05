from pydantic import BaseModel, Field


class AuthRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    subscription: str = "free"
    user: UserOut


class SocialAuthRequest(BaseModel):
    provider: str = Field(min_length=3, max_length=32)
    device_id: str = Field(min_length=6, max_length=128)
