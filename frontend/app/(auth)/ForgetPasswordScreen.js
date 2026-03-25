import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import Input from '../components/Input';
import getEnvVars from '../../config';
import { useAuth } from '../context/AuthContext';

export default function ForgetPassword() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const { apiUrl } = getEnvVars();
  const { login } = useAuth();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const showAlert = (title, message, onPress = null) => {
    const buttons = [
      {
        text: 'OK',
        onPress: () => {
          console.log('Alert pressed:', title);
          if (onPress) onPress();
        }
      }
    ];

    Alert.alert(title, message, buttons, { cancelable: false });
  };

  const tryFetch = async () => {
    try {
      const response = await fetch(`${apiUrl}/auth/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });
      return { response, error: null };
    } catch (error) {
      return { response: null, error };
    }
  };

  const handleSignin = async () => {
    try {
      console.log('Trying to connect to:', apiUrl);
      console.log('Attempting signin...');
      const result = await tryFetch();

      if (!result.response) {
        const errorMsg = result.error?.message || 'Unknown error';
        console.error('Connection error:', errorMsg);
        showAlert('Error', `Could not connect to server: ${errorMsg}`);
        return;
      }

      const response = result.response;
      console.log('Got response:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        Alert.alert('Error', data.error || 'Sign in failed');
        return;
      }

      showAlert('Success', 'Signed in successfully!');

      console.log('Token:', data.token);
      console.log('User type:', data.user_type);
      console.log('User id:', data.user_id);
      console.log('Profile id:', data.profile_id);

      await login(data.token, data.user_type, data.user_id, data.profile_id);
      if (data.user_type === 'customer') {
        router.replace('/(tabs)/SearchScreen');
      }
      else if (data.user_type === 'chef') {
        router.replace('/(tabs)/BookingsScreen');
      }

    } catch (error) {
      console.error('Error in handleSignin:', error);
      showAlert('Error', 'Network error: ' + error.message);
    }
  };

  return (
    <SafeAreaView className="bg-base-100 dark:bg-base-dark-100 flex-1" edges={['top', 'bottom']}>
    <View className="bg-base-100 dark:bg-base-dark-100 flex-1 p-5 pt-0">

      <Text className="text-4xl font-bold text-center mb-5 text-primary-500 dark:text-dark-500">
        Reset Password
      </Text>

      <Input
        label="Enter your email to reset your password"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Button
        title="Send Reset Link"
        style="primary"
        disabled={!email}
        onPress={() => alert("Reset Link sent to " + email)}
      />

      <Button
        title="← Return to Sign In"
        style="secondary"
        onPress={handleBack}
      />
    </View>
    </SafeAreaView>
  );
}