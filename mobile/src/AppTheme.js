import React,{useEffect,useRef,useState,useContext} from 'react';
import {Alert} from 'react-native';
import {readMessengerTheme,saveMessengerTheme} from './chatAppearanceStore';
import {normalizeTheme} from './messengerTheme';
const ThemeContext=React.createContext({mode:'dark',ready:false,saving:false,changeMode:()=>{}});
export function useAppTheme(){return useContext(ThemeContext);}
export function AppThemeProvider({children}){
  const [mode,setMode]=useState('dark'),[ready,setReady]=useState(false),[saving,setSaving]=useState(false);
  const active=useRef(false),busy=useRef(false);
  useEffect(()=>{
    active.current=true;
    readMessengerTheme().then(value=>{if(active.current){setMode(value);setReady(true);}})
      .catch(()=>{if(active.current)setReady(true);});
    return()=>{active.current=false;};
  },[]);
  async function changeMode(value){
    if(!ready||busy.current)return;
    const next=normalizeTheme(value);busy.current=true;setSaving(true);
    try{await saveMessengerTheme(next);if(active.current)setMode(next);}
    catch{if(active.current)Alert.alert('Giao diện','Không thể lưu giao diện. Vui lòng thử lại.');}
    finally{busy.current=false;if(active.current)setSaving(false);}
  }
  return <ThemeContext.Provider value={{mode,ready,saving,changeMode}}>{children}</ThemeContext.Provider>;
}
