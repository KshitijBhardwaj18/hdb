import logging

from fastapi import APIRouter, Depends, HTTPException, status

from api.auth_models import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserResponse,
)
from api.dependencies import get_current_user
from api.services.auth_service import (
    authenticate_user,
    change_user_password,
    register_user,
    update_user_profile,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.post(
    "/password-login",
    response_model=AuthResponse,
    summary="Login with email and password",
    responses={
        200: {"description": "Login successful"},
        401: {"description": "Invalid credentials"},
    },
)
async def login(request: LoginRequest) -> AuthResponse:
    try:
        return authenticate_user(request.email, request.password)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )


@router.post(
    "/password-register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register with email and password",
    responses={
        201: {"description": "Registration successful"},
        409: {"description": "Email already registered"},
    },
)
async def register(request: RegisterRequest) -> AuthResponse:
    try:
        return register_user(request.name, request.email, request.password)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user",
    responses={
        200: {"description": "Current user info"},
        401: {"description": "Not authenticated"},
    },
)
async def me(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    return current_user


@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
    responses={
        200: {"description": "Profile updated"},
        401: {"description": "Not authenticated"},
    },
)
async def update_profile(
    request: UpdateProfileRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    try:
        return update_user_profile(current_user.id, request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )


@router.post(
    "/change-password",
    summary="Change password",
    responses={
        200: {"description": "Password changed"},
        400: {"description": "Invalid current password"},
        401: {"description": "Not authenticated"},
    },
)
async def change_password(
    request: ChangePasswordRequest,
    current_user: UserResponse = Depends(get_current_user),
) -> dict:
    try:
        change_user_password(current_user.id, request.current_password, request.new_password)
        return {"message": "Password changed successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
