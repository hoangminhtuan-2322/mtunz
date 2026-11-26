import React,{memo,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,AppState,StyleSheet,View} from 'react-native';
import {Image as ExpoImage} from 'expo-image';
const scenes=[require('../assets/fishing/scene-0.svg'),require('../assets/fishing/scene-1.svg'),require('../assets/fishing/scene-2.svg')];
const fish=[require('../assets/fishing/fish-0.svg'),require('../assets/fishing/fish-1.svg'),require('../assets/fishing/fish-2.svg'),require('../assets/fishing/fish-3.svg'),require('../assets/fishing/fish-4.svg'),require('../assets/fishing/fish-5.svg'),require('../assets/fishing/fish-6.svg'),require('../assets/fishing/fish-7.svg'),require('../assets/fishing/fish-8.svg'),require('../assets/fishing/fish-9.svg'),require('../assets/fishing/fish-10.svg'),require('../assets/fishing/fish-11.svg'),require('../assets/fishing/fish-12.svg'),require('../assets/fishing/fish-13.svg'),require('../assets/fishing/fish-14.svg'),require('../assets/fishing/fish-15.svg'),require('../assets/fishing/fish-16.svg'),require('../assets/fishing/fish-17.svg'),require('../assets/fishing/fish-18.svg'),require('../assets/fishing/fish-19.svg'),require('../assets/fishing/fish-20.svg'),require('../assets/fishing/fish-21.svg'),require('../assets/fishing/fish-22.svg'),require('../assets/fishing/fish-23.svg'),require('../assets/fishing/fish-24.svg'),require('../assets/fishing/fish-25.svg'),require('../assets/fishing/fish-26.svg'),require('../assets/fishing/fish-27.svg'),require('../assets/fishing/fish-28.svg'),require('../assets/fishing/fish-29.svg')];
const rods=[require('../assets/fishing/rod-0.svg'),require('../assets/fishing/rod-1.svg'),require('../assets/fishing/rod-2.svg'),require('../assets/fishing/rod-3.svg'),require('../assets/fishing/rod-4.svg')];
export const FishingIcon=memo(function FishingIcon({kind='fish',id,large=false}){
 const source=(kind==='rod'?rods:fish)[id];
 return source?<ExpoImage accessible={false} source={source} contentFit="contain" style={large?styles.large:styles.icon}/>:<View style={styles.icon}/>;
});
export const FishingScene=memo(function FishingScene({region,height,casting,ready}){
 const phase=useRef(new Animated.Value(0)).current;
 const [active,setActive]=useState(AppState.currentState==='active'),[reduced,setReduced]=useState(true);
 useEffect(()=>{let mounted=true;AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(mounted)setReduced(v)}).catch(()=>{});
  const a=AppState.addEventListener('change',v=>setActive(v==='active'));
  const b=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
  return()=>{mounted=false;a.remove();b.remove()};
 },[]);
 useEffect(()=>{phase.stopAnimation();phase.setValue(0);if(!active||reduced||!casting)return;
  const loop=Animated.loop(Animated.sequence([Animated.timing(phase,{toValue:1,duration:ready?250:850,useNativeDriver:true,isInteraction:false}),Animated.timing(phase,{toValue:0,duration:ready?250:850,useNativeDriver:true,isInteraction:false})]));
  loop.start();return()=>loop.stop();
 },[phase,active,reduced,casting,ready]);
 return <View style={[styles.scene,{height}]}><ExpoImage accessible={false} source={scenes[region]||scenes[0]} style={StyleSheet.absoluteFillObject} contentFit="fill"/>
 {casting&&<><View pointerEvents="none" style={styles.line}/><Animated.View pointerEvents="none" style={[styles.swimmer,{transform:[{translateX:phase.interpolate({inputRange:[0,1],outputRange:[-8,12]})}]}]}><View style={styles.tail}/></Animated.View><View pointerEvents="none" style={styles.floatAnchor}><Animated.View style={[styles.ripple,{borderColor:ready?'#ffe3a7':'#e7f8e9',opacity:phase.interpolate({inputRange:[0,1],outputRange:[.8,.18]}),transform:[{scale:phase.interpolate({inputRange:[0,1],outputRange:[.7,1.7]})}]}]}/><Animated.View style={[styles.float,{transform:[{translateY:phase.interpolate({inputRange:[0,1],outputRange:[0,ready?5:2]})}]}]}><View style={styles.floatRed}/></Animated.View></View></>}
 </View>;
});
const styles=StyleSheet.create({scene:{borderRadius:14,overflow:'hidden',backgroundColor:'#40696d'},icon:{width:58,height:44},large:{width:112,height:76},line:{position:'absolute',left:'40.2%',top:'46%',height:'26%',width:1,backgroundColor:'#fff7dd99'},swimmer:{position:'absolute',left:'48%',top:'78%',width:22,height:8,borderRadius:8,backgroundColor:'#102c39',opacity:.24},tail:{position:'absolute',left:-6,width:0,height:0,borderRightWidth:8,borderRightColor:'#102c39',borderTopWidth:4,borderBottomWidth:4,borderTopColor:'transparent',borderBottomColor:'transparent'},floatAnchor:{position:'absolute',left:'40%',top:'72%',width:32,height:18,alignItems:'center',justifyContent:'center'},ripple:{position:'absolute',width:30,height:9,borderWidth:1.5,borderRadius:20},float:{width:7,height:14,borderRadius:6,backgroundColor:'#fff6df',overflow:'hidden',marginTop:-11},floatRed:{height:7,backgroundColor:'#dc715e'}});
