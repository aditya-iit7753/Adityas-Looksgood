import { StripeProvider } from "@stripe/stripe-react-native";
import AppNavigator from "./navigation/AppNavigator";

export default function App() {
  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  return (
    <StripeProvider publishableKey={publishableKey}>
      <AppNavigator />
    </StripeProvider>
  );
}
