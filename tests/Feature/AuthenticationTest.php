<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_uses_hashed_password_and_returns_a_session_principal(): void
    {
        $user = User::factory()->create(['password' => 'testing-password']);

        $response = $this->withHeaders(['Origin' => 'http://localhost:5173'])
            ->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => 'testing-password',
            ]);

        $response->assertOk()
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.email', $user->email);
        $this->assertAuthenticatedAs($user);
    }

    public function test_invalid_credentials_do_not_authenticate(): void
    {
        $user = User::factory()->create(['password' => 'testing-password']);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'wrong-password',
        ])->assertUnprocessable();

        $this->assertGuest();
    }

    public function test_inactive_users_cannot_log_in(): void
    {
        $user = User::factory()->create(['password' => 'testing-password', 'is_active' => false]);

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'testing-password',
        ])->assertUnprocessable();

        $this->assertGuest();
    }

    public function test_private_endpoints_require_authentication(): void
    {
        $this->getJson('/api/v1/employees')->assertUnauthorized();
    }

    public function test_session_restoration_is_not_limited_by_login_throttle(): void
    {
        $user = User::factory()->create();

        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->actingAs($user)->getJson('/api/v1/auth/me')->assertOk();
        }
    }

    public function test_logout_invalidates_the_authenticated_session(): void
    {
        $user = User::factory()->create(['password' => 'testing-password']);
        $this->withHeaders(['Origin' => 'http://localhost:5173'])
            ->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => 'testing-password',
            ])
            ->assertOk();

        $this->postJson('/api/v1/auth/logout')
            ->assertNoContent();

        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
        $this->assertGuest();
    }
}
