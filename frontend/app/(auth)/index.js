import { Text, View, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from '../components/Button';

export default function LandingScreen() {
  return (
    <SafeAreaView className="flex-1 bg-primary-200 dark:bg-dark-200" edges={['top', 'bottom']}>
    <View className="flex-1 items-center bg-primary-200 dark:bg-dark-200">
      <View className="flex-1 w-full items-center pt-8 px-8">
        <View className="mb-8 items-center">
          <Image
            source={require('../assets/icon.png')}
            className="w-48 h-48 mb-4"
            resizeMode="contain"
          />
          <Text className="text-5xl font-bold text-primary-500 dark:text-dark-500 text-shadow-lg">ChefAsap</Text>
          <Text className="text-xl font-bold text-primary-400 dark:text-dark-400 text-shadow-lg">Book a Chef in Minutes</Text>
        </View>

        <View className="absolute bottom-[100px] justify-center">

          <Button
            title="Sign Up"
            style="primary"
            href="/SignUpScreen"
            customClasses="min-w-[50%]"
          />

          <Button
            title="Log In"
            style="secondary"
            href="/SignInScreen"
            customClasses="min-w-[50%]"
          />
        </View>
      </View>
    </View>
    </SafeAreaView>
  );
}