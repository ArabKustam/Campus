import {describe,it,expect} from 'vitest'
import {nameFromLogin,studentName} from './person-name'
describe('name from Platonus login',()=>{
 it('splits first and last name on underscores and capitalizes',()=>{expect(nameFromLogin('Ivan_Petrov')).toBe('Ivan Petrov');expect(nameFromLogin('ivan_petrov')).toBe('Ivan Petrov');expect(nameFromLogin('IVAN_PETROV')).toBe('Ivan Petrov')})
 it('accepts dots, repeated separators and surrounding spaces',()=>{expect(nameFromLogin('  ivan..petrov ')).toBe('Ivan Petrov');expect(nameFromLogin('ivan__petrov')).toBe('Ivan Petrov');expect(nameFromLogin('_ivan_petrov_')).toBe('Ivan Petrov');expect(nameFromLogin('ivan.petrov@uni.kz')).toBe('Ivan Petrov')})
 it('handles Cyrillic and Kazakh letters',()=>{expect(nameFromLogin('иван_петров')).toBe('Иван Петров');expect(nameFromLogin('ӘЛІМ_НҰРЛАНҰЛЫ')).toBe('Әлім Нұрланұлы')})
 it('drops digit-only parts and trailing digits',()=>{expect(nameFromLogin('Ivan_Petrov_2')).toBe('Ivan Petrov');expect(nameFromLogin('ivan_petrov01')).toBe('Ivan Petrov');expect(nameFromLogin('2024_ivan_petrov')).toBe('Ivan Petrov')})
 it('keeps hyphenated names and three-part names',()=>{expect(nameFromLogin('anna-maria_ivanova')).toBe('Anna-Maria Ivanova');expect(nameFromLogin('Ivan_Petrov_Sergeevich')).toBe('Ivan Petrov Sergeevich')})
 it('returns null for logins that are not names',()=>{for(const login of [null,undefined,'','ivan','123456','ivan_','ab1c_def','user_x@y','a_b_c_d_e_f'])expect(nameFromLogin(login)).toBeNull()})
})
describe('student display name',()=>{
 it('prefers the real Platonus name, then the Platonus login, then the account',()=>{
  expect(studentName({platonusName:' Әлім Нұрланұлы ',platonusLogin:'ivan_petrov',displayName:'x',login:'x'})).toEqual({name:'Әлім Нұрланұлы',source:'platonus'})
  expect(studentName({platonusName:null,platonusLogin:'Ivan_Petrov',displayName:'ip',login:'ip'})).toEqual({name:'Ivan Petrov',source:'login'})
  expect(studentName({platonusLogin:'12345',displayName:'Ваня',login:'ivan'})).toEqual({name:'Ваня',source:'account'})
  expect(studentName({displayName:'maria_ivanova',login:'maria_ivanova'})).toEqual({name:'Maria Ivanova',source:'login'})
  expect(studentName({displayName:'student1',login:'student1'})).toEqual({name:'student1',source:'account'})
 })
})
