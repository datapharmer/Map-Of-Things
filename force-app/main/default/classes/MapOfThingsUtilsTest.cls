@isTest
public with sharing class MapOfThingsUtilsTest {
    
    @testSetup
    private static void setup(){
        Account acc = new Account(
            Name = '#test',
            BillingLatitude = 37.790082,
            BillingLongitude = -122.400213,
            Description = '#test Description'
        );
        insert acc;
    }

    private static testMethod void myTest201() {    
        List<Object> rs = MapOfThingsUtils.getRecords(
            'Account',
            'BillingLatitude',
            'BillingLongitude', 
            'Description', 
            '', 
            'Name', 
            ''
        );
        System.assertEquals(1, rs.size());
    }
    
    private static testMethod void myTest202() {        
        List<Object> rs = MapOfThingsUtils.getRecords(
            'Account',
            'BillingLatitude',
            'BillingLongitude', 
            'Description', 
            '', 
            'Name', 
            ''
        );
        System.assertEquals(1, rs.size());
    }
    
    private static testMethod void myTest301() {   
        List<Object> rs = MapOfThingsUtils.getRecords(
            'Account',
            'BillingLatitude',
            'BillingLongitude', 
            'Description', 
            '', 
            '', 
            'Name <> \'aaa\''
        );
        System.assertEquals(1, rs.size());
    }
    
    private static testMethod void myTest302() {        
        List<Object> rs = MapOfThingsUtils.getRecords(
            'Account',
            'BillingLatitude',
            'BillingLongitude', 
            'Description', 
            '', 
            '', 
            'Name <> \'aaa\''
        );        
        System.assertEquals(1, rs.size());
    }
    
    private static testMethod void myTest401() {        
        List<Object> rs = MapOfThingsUtils.getRecords(
            'Account',
            'BillingLatitude',
            'BillingLongitude',
            'Description',
            '',
            '',
            ''
        ); 
        System.assertEquals(1, rs.size());       
    }
    
    private static testMethod void myTest501() {        
        List<Object> rs = MapOfThingsUtils.getRecords(
            'Account',
            'BillingLatitude',
            'BillingLongitude',
            'Description',
            '',
            'Name',
            ''
        );
        System.assertEquals(1, rs.size());
    }
    
    private static testMethod void myTest502() {        
        List<Object> rs = MapOfThingsUtils.getRecords(
            'Account',
            'BillingLatitude',
            'BillingLongitude',
            'Description',
            '',
            'Name',
            'Name <> \'aaa\''
        );
        System.assertEquals(1, rs.size());        
    }

    private static testMethod void myTest901() {
        try{    
            MapOfThingsUtils.getRecords(
                'invalid',
                'BillingLatitude',
                'BillingLongitude', 
                'Description', 
                '', 
                'Name',
                ''
            );        
        } catch (Exception e) {
            System.assertEquals('Object API Name is invalid.', e.getMessage());
        }        
    }

    private static testMethod void myTest911() {
        try{    
            MapOfThingsUtils.getRecords(
                'Account',
                'invalid',
                'BillingLongitude', 
                'Description', 
                '', 
                'Name',
                ''
            );        
        } catch (Exception e) {
            System.assertEquals('Error occurred on querying SOQL. Some properties for Object name / Field names are wrong or missing.', e.getMessage());
        }        
    }
    
    private static testMethod void myTest912() {
        try{    
            MapOfThingsUtils.getRecords(
                'Account',
                'BillingLatitude',
                'invalid', 
                'Description', 
                '', 
                'Name',
                ''
            );        
        } catch (Exception e) {
            System.assertEquals('Error occurred on querying SOQL. Some properties for Object name / Field names are wrong or missing.', e.getMessage());
        }        
    }
    
    private static testMethod void myTest913() {
        try{    
            MapOfThingsUtils.getRecords(
                'Account',
                'BillingLatitude',
                'BillingLongitude', 
                'invalid', 
                '', 
                'Name',
                ''
            );        
        } catch (Exception e) {
            System.assertEquals('Error occurred on querying SOQL. Some properties for Object name / Field names are wrong or missing.', e.getMessage());
        }        
    }
    
    private static testMethod void myTest914() {
        try{    
            MapOfThingsUtils.getRecords(
                'Account',
                'BillingLatitude',
                'BillingLongitude', 
                'Description', 
                'invalid', 
                'Name',
                ''
            );        
        } catch (Exception e) {
            System.assertEquals('Error occurred on querying SOQL. Some properties for Object name / Field names are wrong or missing.', e.getMessage());
        }        
    }
    
    private static testMethod void myTest915() {
        try{    
            MapOfThingsUtils.getRecords(
                'Account',
                'BillingLatitude',
                'BillingLongitude', 
                'Description', 
                '', 
                'invalid',
                ''
            );        
        } catch (Exception e) {
            System.assertEquals('Error occurred on querying SOQL. Some properties for Object name / Field names are wrong or missing.', e.getMessage());
        }        
    }
    
    private static testMethod void myTest917() {
        try{    
            MapOfThingsUtils.getRecords(
                'Account',
                'invalid',
                'invalid', 
                'invalid', 
                'invalid', 
                'invalid',
                'invalid'
            );        
        } catch (Exception e) {
            System.assertEquals('Error occurred on querying SOQL. Some properties for Object name / Field names are wrong or missing.', e.getMessage());
        }        
    }
    
    private static testMethod void myTest999() {
        try{    
            MapOfThingsUtils.getRecords(
                'invalid',
                'invalid',
                'invalid', 
                'invalid', 
                'invalid', 
                'invalid',
                'invalid'
            );        
        } catch (Exception e) {
            System.assertEquals('Object API Name is invalid.', e.getMessage());
        }        
    }
}
