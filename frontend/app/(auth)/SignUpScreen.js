import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Button from '../components/Button';
import Input from '../components/Input';
import Card from '../components/Card';
import CustomPicker from "../components/Picker";
import getEnvVars from '../../config';

const validatePassword = (password) => {
  const requirements = [
    { test: /.{8,}/, message: 'At least 8 characters' },
    { test: /[A-Z]/, message: 'At least one uppercase letter' },
    { test: /[a-z]/, message: 'At least one lowercase letter' },
    { test: /[0-9]/, message: 'At least one number' },
    { test: /[!@#$%^&*]/, message: 'At least one special character (!@#$%^&*)' }
  ];

  return requirements.map(req => ({
    message: req.message,
    met: req.test.test(password)
  }));
};

const validateEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

const filterNameCharacters = (text) => {
  const filteredText = text.replace(/[^a-zA-Z\s'-]/g, '');
  return filteredText;
};

const filterDigits = (text) => {
  return text.replace(/[^0-9]/g, '');
};

const filterAddressCharacters = (text) => {
  return text.replace(/[^a-zA-Z0-9\s.,\-\/#]/g, '');
};

const filterAlphabeticCharacters = (text) => {
  return text.replace(/[^a-zA-Z\s'-]/g, '');
};

export default function Signup() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMatchError, setPasswordMatchError] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [address2, setAddress2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [userType, setUserType] = useState('customer');
  const [passwordRequirements, setPasswordRequirements] = useState([]);
  const router = useRouter();
  const { apiUrl } = getEnvVars();

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  const US_STATES = [
    { label: "State", value: "" },
    { label: "Alabama", value: "AL" },
    { label: "Alaska", value: "AK" },
    { label: "Arizona", value: "AZ" },
    { label: "Arkansas", value: "AR" },
    { label: "California", value: "CA" },
    { label: "Colorado", value: "CO" },
    { label: "Connecticut", value: "CT" },
    { label: "Delaware", value: "DE" },
    { label: "Florida", value: "FL" },
    { label: "Georgia", value: "GA" },
    { label: "Hawaii", value: "HI" },
    { label: "Idaho", value: "ID" },
    { label: "Illinois", value: "IL" },
    { label: "Indiana", value: "IN" },
    { label: "Iowa", value: "IA" },
    { label: "Kansas", value: "KS" },
    { label: "Kentucky", value: "KY" },
    { label: "Louisiana", value: "LA" },
    { label: "Maine", value: "ME" },
    { label: "Maryland", value: "MD" },
    { label: "Massachusetts", value: "MA" },
    { label: "Michigan", value: "MI" },
    { label: "Minnesota", value: "MN" },
    { label: "Mississippi", value: "MS" },
    { label: "Missouri", value: "MO" },
    { label: "Montana", value: "MT" },
    { label: "Nebraska", value: "NE" },
    { label: "Nevada", value: "NV" },
    { label: "New Hampshire", value: "NH" },
    { label: "New Jersey", value: "NJ" },
    { label: "New Mexico", value: "NM" },
    { label: "New York", value: "NY" },
    { label: "North Carolina", value: "NC" },
    { label: "North Dakota", value: "ND" },
    { label: "Ohio", value: "OH" },
    { label: "Oklahoma", value: "OK" },
    { label: "Oregon", value: "OR" },
    { label: "Pennsylvania", value: "PA" },
    { label: "Rhode Island", value: "RI" },
    { label: "South Carolina", value: "SC" },
    { label: "South Dakota", value: "SD" },
    { label: "Tennessee", value: "TN" },
    { label: "Texas", value: "TX" },
    { label: "Utah", value: "UT" },
    { label: "Vermont", value: "VT" },
    { label: "Virginia", value: "VA" },
    { label: "Washington", value: "WA" },
    { label: "West Virginia", value: "WV" },
    { label: "Wisconsin", value: "WI" },
    { label: "Wyoming", value: "WY" },
  ];

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
      const response = await fetch(`${apiUrl}/auth/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          password,
          user_type: userType,
          phone,
          address,
          address2,
          city,
          state,
          zip,
        }),
      });
      return { response, error: null };
    } catch (error) {
      return { response: null, error };
    }
  };

  const handleSignup = async () => {
    // Check if all password requirements are met
    const allRequirementsMet = passwordRequirements.every(req => req.met);
    if (!allRequirementsMet) {
      showAlert('Error', 'Please meet all password requirements');
      return;
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      showAlert('Error', 'Passwords do not match');
      return;
    }

    // Check if required fields are filled
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !address.trim() || !city.trim() || !state.trim() || !zip.trim()) {
      showAlert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      console.log('Trying to connect to:', apiUrl);
      console.log('Attempting signup...');
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
        Alert.alert('Error', data.error || 'Signup failed');
        return;
      }

      console.log('Token:', data.token);
      console.log('User type:', userType);

      showAlert('Success', 'Account created successfully!', () => {
        router.replace('/SignInScreen');
      });

    } catch (error) {
      console.error('Error in handleSignup:', error);
      showAlert('Error', 'Network error: ' + error.message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-base-100 dark:bg-base-dark-100" edges={['top', 'bottom']}>
    <ScrollView className="flex-1 bg-base-100 dark:bg-base-dark-100 p-5 pt-0">

      <Text className="text-4xl font-bold text-center text-primary-500 dark:text-dark-500">
        Create An Account
      </Text>

      <Button
        title="Already have an account?"
        style="transparent"
        base="link"
        customTextClasses='mb-2'
        href="/SignInScreen"
      />

      <Card title="Personal Information" headerIcon="person">
        <Text className="text-sm font-semibold mb-1 mt-2 text-primary-400 dark:text-dark-400">Name</Text>
        <View className="flex-row justify-between">
          <Input
            placeholder="First Name"
            value={firstName}
            onChangeText={(text) => setFirstName(filterNameCharacters(text))}
            containerClasses="flex-1 mx-0.5 mb-2 mt-0"
          />

          <Input
            placeholder="Last Name"
            value={lastName}
            onChangeText={(text) => setLastName(filterNameCharacters(text))}
            containerClasses="flex-1 mx-0.5 mb-2 mt-0"
          />
        </View>

        <Input
          label="Email Address"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (text.length > 0 && !validateEmail(text)) {
              setEmailError('Please enter a valid email address');
            } else {
              setEmailError('');
            }
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          error={emailError}
          placeholder="your.email@example.com"
        />

        <Input label="Phone Number"
          value={phone}
          onChangeText={(text) => setPhone(filterDigits(text))}
          keyboardType="phone-pad"
          placeholder="(555) 123-4567"
          maxLength={10}
        />
      </Card>

      <Card title="Create Password" headerIcon="lock">
        <Input
          label="Password"
          placeholder="Enter a secure password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setPasswordRequirements(validatePassword(text));
            if (confirmPassword && text !== confirmPassword) {
              setPasswordMatchError('Passwords do not match');
            } else {
              setPasswordMatchError('');
            }
          }}
          secureTextEntry
        />

        <Input
          label="Confirm Password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChangeText={(text) => {
            setConfirmPassword(text);
            if (password && text !== password) {
              setPasswordMatchError('Passwords do not match');
            } else {
              setPasswordMatchError('');
            }
          }}
          secureTextEntry
          error={passwordMatchError}
          containerClasses="mb-1"
        />

        <View className="mt-2 p-3 bg-primary-100 rounded-xl dark:bg-dark-100">
          <Text className="text-sm font-semibold mb-1 text-primary-400 dark:text-dark-400">Password must have:</Text>
          {passwordRequirements.map((req, index) => (
            <Text
              key={index}
              className={`text-xs mb-0.5 ${req.met ? 'text-primary-400 dark:text-dark-400' : 'text-warm-gray'}`}
            >
              {req.met ? '✓' : '○'} {req.message}
            </Text>
          ))}
        </View>
      </Card>

      <Card title="Your Address" headerIcon="location">
        <Input
          label="Street Address"
          placeholder="123 Main Street"
          value={address}
          onChangeText={(text) => setAddress(filterAddressCharacters(text))}
        />

        <Input
          label="Apartment, Suite, etc. (Optional)"
          placeholder="Apt 4B, Suite 200, etc."
          value={address2}
          onChangeText={(text) => setAddress2(filterAddressCharacters(text))}
        />

        <Input
          label="City"
          placeholder="City"
          value={city}
          onChangeText={(text) => setCity(filterAlphabeticCharacters(text))}
        />

        <View className="flex-row justify-between">

          <CustomPicker
            label="State"
            prompt="Select a State"
            selectedValue={state}
            onValueChange={(v) => setState(v)}
            items={US_STATES}
          />

          <View className="flex-1 ml-3">
            <Input
              label="Zip Code"
              placeholder="12345"
              value={zip}
              onChangeText={(text) => setZip(filterDigits(text))}
              keyboardType="numeric"
              maxLength={5}
              customClasses="text-center"
              containerClasses="mb-2"
            />
          </View>
        </View>
      </Card>

      <Card title="I am a..." headerIcon="smiley">
        <View className="flex-row justify-between mt-2">

          <TouchableOpacity
            className={`flex-1 py-4 px-2 rounded-2xl mx-0.5 items-center border ${userType === 'customer'
              ? 'bg-primary-200 border-primary-400 dark:bg-dark-200 dark:border-dark-400'
              : 'bg-primary-100 border-primary-200 dark:bg-dark-100 dark:border-dark-200'
              }`}
            onPress={() => setUserType('customer')}
          >
            <Text
              className={`text-base font-bold text-center mb-1 ${userType === 'customer' ? 'text-primary-500' : 'text-primary-400 dark:text-dark-400'
                }`}
            >
              Customer
            </Text>
            <Text className="text-xs text-center text-warm-gray">Looking for chefs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            className={`flex-1 py-4 px-2 rounded-2xl mx-0.5 items-center border ${userType === 'chef'
              ? 'bg-primary-200 border-primary-400 dark:bg-dark-200 dark:border-dark-400'
              : 'bg-primary-100 border-primary-200 dark:bg-dark-100 dark:border-dark-200'
              }`}
            onPress={() => setUserType('chef')}
          >
            <Text
              className={`text-base font-bold text-center mb-1 ${userType === 'chef' ? 'text-primary-500' : 'text-primary-400 dark:text-dark-400'
                }`}
            >
              Chef
            </Text>
            <Text className="text-xs text-center text-warm-gray">Offering services</Text>
          </TouchableOpacity>
        </View>
      </Card>

      <Button
        title="Create Account"
        style="primary"
        onPress={handleSignup}
      />

      <Button
        title="← Back"
        style="secondary"
        onPress={handleBack}
      />

      <View className="h-8" />

    </ScrollView>
    </SafeAreaView>
  );
}