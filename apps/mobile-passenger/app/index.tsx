import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useRideStore } from '../src/store/rideStore';

/** Portao de entrada: decide entre onboarding, corrida ativa e home. */
export default function Index() {
  const user = useAuthStore((state) => state.user);
  const activeRide = useRideStore((state) => state.activeRide);

  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (activeRide) return <Redirect href="/(app)/searching" />;
  return <Redirect href="/(app)/home" />;
}
